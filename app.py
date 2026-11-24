import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from lightgbm import LGBMClassifier
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense
from tensorflow.keras.optimizers import Adam
import category_encoders as ce
import matplotlib
matplotlib.use('Agg')
import signal
import sys
import uuid
import shutil
import traceback

app = Flask(__name__, template_folder='templates', static_folder='static', static_url_path='/static')
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
CORS(app, resources={r"/*": {"origins": "*"}})
executor = ThreadPoolExecutor()

def build_autoencoder(input_dim):
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import Input
    input_layer = Input(shape=(input_dim,))
    encoded = Dense(64, activation='relu')(input_layer)
    encoded = Dense(32, activation='relu')(encoded)
    decoded = Dense(64, activation='relu')(encoded)
    decoded = Dense(input_dim, activation='sigmoid')(decoded)
    autoencoder = Model(input_layer, decoded)
    autoencoder.compile(optimizer=Adam(learning_rate=0.001), loss='mse')
    return autoencoder

def build_deep_classifier(input_dim):
    model = Sequential()
    model.add(Dense(64, input_dim=input_dim, activation='relu'))
    model.add(Dense(32, activation='relu'))
    model.add(Dense(1, activation='sigmoid'))
    model.compile(optimizer=Adam(learning_rate=0.001), loss='binary_crossentropy', metrics=['accuracy'])
    return model

def run_model(features_train, features_test, model_type, contamination=None, labels_train=None, labels_test=None, threshold_mode='contamination'):
    contamination = contamination if contamination else 0.1

    if model_type == 'isolation_forest':
        iso_contam = contamination if threshold_mode == 'contamination' else 'auto'
        model = IsolationForest(contamination=iso_contam, random_state=42)
        model.fit(features_train)
        train_preds = np.where(model.predict(features_train) == 1, 0, 1)
        test_preds = np.where(model.predict(features_test) == 1, 0, 1)
        return train_preds, test_preds

    elif model_type == 'autoencoder':
        model = build_autoencoder(features_train.shape[1])
        model.fit(features_train, features_train, epochs=50, batch_size=32, verbose=0)
        # Compute reconstruction error on training set for threshold
        train_recon = model.predict(features_train, verbose=0)
        train_mse = np.mean(np.power(features_train - train_recon, 2), axis=1)
        if threshold_mode == 'contamination':
            threshold = np.quantile(train_mse, 1 - contamination)
        else:
            threshold = np.mean(train_mse) + 2 * np.std(train_mse)
        train_preds = (train_mse > threshold).astype(int)
        test_recon = model.predict(features_test, verbose=0)
        test_mse = np.mean(np.power(features_test - test_recon, 2), axis=1)
        test_preds = (test_mse > threshold).astype(int)
        return train_preds, test_preds

    elif model_type == 'random_forest':
        clf = RandomForestClassifier(n_estimators=100, random_state=42)
        clf.fit(features_train, labels_train)
        train_preds = clf.predict(features_train)
        test_preds = clf.predict(features_test)
        return train_preds, test_preds

    elif model_type == 'lightgbm':
        clf = LGBMClassifier(random_state=42, verbose=-1)
        clf.fit(features_train, labels_train)
        train_preds = clf.predict(features_train)
        test_preds = clf.predict(features_test)
        return train_preds, test_preds

    elif model_type == 'deep_learning':
        model = build_deep_classifier(features_train.shape[1])
        model.fit(features_train, labels_train, epochs=50, batch_size=32, verbose=0)
        train_preds = (model.predict(features_train, verbose=0).flatten() > 0.5).astype(int)
        test_preds = (model.predict(features_test, verbose=0).flatten() > 0.5).astype(int)
        return train_preds, test_preds

    else:
        raise ValueError(f"Unsupported model type: {model_type}")


def apply_fusion(all_test_preds):
    """Majority voting fusion: returns 1 if majority of models predict anomaly."""
    stacked = np.stack(list(all_test_preds.values()), axis=1)
    # Majority vote: anomaly if more than half of models say anomaly
    fusion = (stacked.sum(axis=1) > stacked.shape[1] / 2).astype(int)
    return fusion


def compute_metrics(y_true, y_pred):
    """Compute classification metrics and confusion matrix."""
    metrics = {'accuracy': None, 'precision': None, 'recall': None, 'f1': None, 'confusion_matrix': None}
    if y_true is None:
        return metrics
    try:
        y_true = np.array(y_true).astype(int)
        y_pred = np.array(y_pred).astype(int)
        if len(np.unique(y_true)) == 2:
            metrics['accuracy'] = float(accuracy_score(y_true, y_pred))
            metrics['precision'] = float(precision_score(y_true, y_pred, zero_division=0))
            metrics['recall'] = float(recall_score(y_true, y_pred, zero_division=0))
            metrics['f1'] = float(f1_score(y_true, y_pred, zero_division=0))
            cm = confusion_matrix(y_true, y_pred).tolist()
            metrics['confusion_matrix'] = cm
    except Exception as e:
        print(f"Metrics error: {str(e)}")
    return metrics


def process_file(file, models, target_col, contamination, threshold_mode):
    try:
        # Read file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file.stream)
        else:
            df = pd.read_json(file.stream)

        labels = None
        le_labels = None
        if target_col and target_col in df.columns:
            raw_labels = df[target_col].copy().astype(str)
            df = df.drop(columns=[target_col])
            le_labels = LabelEncoder()
            labels = le_labels.fit_transform(raw_labels)

        if df.empty:
            return {'error': 'No features remaining after target column removal'}

        # Separate feature types
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        categorical_cols = df.select_dtypes(exclude=['number']).columns.tolist()

        # Impute numerics
        if numeric_cols:
            imputer = SimpleImputer(strategy='mean')
            df[numeric_cols] = imputer.fit_transform(df[numeric_cols])

        # Encode categoricals
        encoded_parts = []
        for col in categorical_cols:
            nunique = df[col].nunique()
            if nunique <= 50:
                oh = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
                enc = oh.fit_transform(df[[col]])
                enc_df = pd.DataFrame(enc, columns=oh.get_feature_names_out([col]), index=df.index)
                encoded_parts.append(enc_df)
            elif nunique <= 500:
                df[col] = LabelEncoder().fit_transform(df[col].astype(str))
                encoded_parts.append(df[[col]])
            else:
                he = ce.HashingEncoder(cols=[col], n_components=32)
                hash_df = he.fit_transform(df[[col]])
                hash_df.index = df.index
                encoded_parts.append(hash_df)

        df_num = df[numeric_cols].copy() if numeric_cols else pd.DataFrame(index=df.index)
        feature_df = pd.concat([df_num] + encoded_parts, axis=1) if encoded_parts else df_num

        # Scale
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(feature_df)

        # Train/test split (80/20)
        test_size = 0.2
        if labels is not None:
            X_train, X_test, y_train, y_test = train_test_split(
                features_scaled, labels, test_size=test_size, random_state=42, stratify=labels if len(np.unique(labels)) > 1 else None
            )
        else:
            split_idx = int(len(features_scaled) * (1 - test_size))
            X_train = features_scaled[:split_idx]
            X_test = features_scaled[split_idx:]
            y_train = None
            y_test = None

        # Save preprocessed CSV (full dataset)
        feature_df_save = feature_df.copy()
        if labels is not None:
            feature_df_save[target_col] = labels
        preprocessed_filename = f"preprocessed_{uuid.uuid4().hex}.csv"
        preprocessed_path = os.path.join("static", "temp", preprocessed_filename)
        os.makedirs(os.path.dirname(preprocessed_path), exist_ok=True)
        feature_df_save.to_csv(preprocessed_path, index=False)

        # Run each model
        results = {}
        all_test_preds = {}

        for model_type in models:
            try:
                train_preds, test_preds = run_model(
                    X_train, X_test, model_type,
                    contamination=contamination,
                    labels_train=y_train,
                    labels_test=y_test,
                    threshold_mode=threshold_mode
                )

                # Stats on test set
                total_test = len(test_preds)
                n_anomalies = int(test_preds.sum())
                n_normal = total_test - n_anomalies

                # Stats on full dataset (combine)
                all_preds = np.concatenate([train_preds, test_preds])
                total_all = len(all_preds)
                n_anomalies_all = int(all_preds.sum())
                n_normal_all = total_all - n_anomalies_all

                # Metrics on test set
                metrics = compute_metrics(y_test, test_preds)

                results[model_type] = {
                    'metrics': metrics,
                    'stats': {
                        'total_samples': total_all,
                        'test_samples': total_test,
                        'train_samples': len(train_preds),
                        'normal': n_normal_all,
                        'anomalies': n_anomalies_all,
                        'anomaly_rate': float(n_anomalies_all) / total_all,
                        'used_contamination': contamination if model_type in ['isolation_forest', 'autoencoder'] and threshold_mode == 'contamination' else None
                    }
                }
                all_test_preds[model_type] = test_preds

            except Exception as model_err:
                print(f"Model {model_type} error: {model_err}")
                traceback.print_exc()
                results[model_type] = {'error': str(model_err)}

        # Fusion logic (majority voting) — only if multiple models succeeded
        fusion_result = None
        valid_models = {k: v for k, v in all_test_preds.items() if k in results and 'error' not in results[k]}
        if len(valid_models) > 1:
            fusion_preds = apply_fusion(valid_models)
            n_fusion_anomalies = int(fusion_preds.sum())
            n_fusion_normal = len(fusion_preds) - n_fusion_anomalies
            fusion_metrics = compute_metrics(y_test, fusion_preds)
            fusion_result = {
                'metrics': fusion_metrics,
                'stats': {
                    'total_samples': len(fusion_preds),
                    'normal': n_fusion_normal,
                    'anomalies': n_fusion_anomalies,
                    'anomaly_rate': float(n_fusion_anomalies) / len(fusion_preds),
                    'used_contamination': None
                }
            }

        return {
            'file_name': file.filename,
            'results': results,
            'fusion': fusion_result,
            'preprocessed_download': f"/static/temp/{preprocessed_filename}",
            'train_size': len(X_train),
            'test_size': len(X_test),
            'total_features': features_scaled.shape[1]
        }

    except Exception as e:
        traceback.print_exc()
        return {'error': str(e)}


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400
        files = request.files.getlist('files')
        if not files or all(file.filename == '' for file in files):
            return jsonify({'error': 'No files selected'}), 400

        models_str = request.form.get('models', '')
        target_col = request.form.get('targetColumn', '').strip()
        contamination_raw = request.form.get('contamination', '').strip()
        threshold_mode = request.form.get('thresholdMode', 'contamination')
        contamination = None

        try:
            if contamination_raw:
                contamination = float(contamination_raw)
                if not (0 < contamination < 1):
                    raise ValueError("Contamination must be between 0 and 1")
        except ValueError:
            return jsonify({'error': 'Invalid contamination value. Must be a float between 0 and 1.'}), 400

        if not models_str:
            return jsonify({'error': 'No models selected'}), 400

        models = models_str.split(',')
        valid_models = {'isolation_forest', 'autoencoder', 'random_forest', 'lightgbm', 'deep_learning'}
        invalid_models = set(models) - valid_models
        if invalid_models:
            return jsonify({'error': f'Invalid models: {", ".join(invalid_models)}'}), 400

        results, errors = [], []
        with ThreadPoolExecutor() as ex:
            futures = [ex.submit(process_file, file, models, target_col, contamination, threshold_mode) for file in files]
            for future in futures:
                try:
                    result = future.result()
                    if 'error' in result:
                        errors.append(result['error'])
                    else:
                        results.append(result)
                except Exception as e:
                    errors.append(str(e))
                    traceback.print_exc()

        if errors:
            return jsonify({
                'status': 'error',
                'error': 'Some files failed processing',
                'errors': errors,
                'results': results
            }), 400

        return jsonify(results)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def cleanup_temp_folder():
    temp_dir = os.path.join(app.static_folder, 'temp')
    if os.path.exists(temp_dir):
        print(f"Cleaning up: {temp_dir}")
        shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)


if __name__ == '__main__':
    if sys.platform != 'win32':
        signal.signal(signal.SIGINT, lambda s, f: (cleanup_temp_folder(), sys.exit(0)))
        signal.signal(signal.SIGTERM, lambda s, f: (cleanup_temp_folder(), sys.exit(0)))
    else:
        import atexit
        atexit.register(cleanup_temp_folder)

    app.run(host='0.0.0.0', port=5000, debug=True, use_debugger=True, use_reloader=False if sys.platform == 'win32' else True)
