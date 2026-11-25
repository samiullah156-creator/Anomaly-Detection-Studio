<!-- styled:v2 -->
<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1d1726,50:167dfe,100:9533fa&height=180&section=header&text=Anomaly%20Detection%20Studio&fontSize=38&fontColor=ffffff&fontAlignY=36&desc=Open-source%20project&descAlignY=58&descSize=16&animation=fadeIn" width="100%" alt="Anomaly Detection Studio" />

**A powerful web-based platform for detecting anomalies in datasets using both supervised and unsupervised machine learning models. This application allows you to upload your data, select multiple models, and compare their performance in one place.**


<p>
  <a href="#features">Features</a>
</p>

</div>

---

## 📋 Table of Contents

- [What is This Project?](#what-is-this-project)
- [How Does It Work?](#how-does-it-work)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [How to Use](#how-to-use)
- [Technical Details](#technical-details)
- [Features](#features)
- [About](#about)

---

## What is This Project?

**Anomaly Detection Studio** is a web application that helps you find unusual patterns or outliers in your data. Think of it like a smart detective that can spot things that don't fit the normal pattern in your dataset.

### Key Capabilities:
- **Upload datasets** in CSV or JSON format
- **Choose from 5 different AI models** to analyze your data
- **Compare results** side-by-side to see which model works best
- **Visualize results** with interactive charts
- **Export results** for further analysis

---

## How Does It Work?

The application works in three main parts:

### 1. **Frontend (User Interface)**
The user interface is built with HTML, CSS, and JavaScript. It's what you see and interact with in your web browser.

**Files:**
- `templates/index.html` - The main webpage structure
- `static/style.css` - All the styling and visual design
- `static/script.js` - Handles user interactions and displays results

**What it does:**
- Shows a form where you can upload files
- Lets you select which models to use
- Displays the results in tables and charts
- Handles file uploads and sends them to the server

### 2. **Backend (Server)**
The backend is a Python Flask server that does all the heavy work.

**File:**
- `app.py` - The main server file that processes your data

**What it does:**
- Receives your uploaded files
- Cleans and prepares your data automatically
- Runs the selected machine learning models
- Calculates performance metrics
- Sends results back to the frontend

### 3. **Machine Learning Models**
The application uses 5 different models to detect anomalies:

**Unsupervised Models** (work without labels):
- **Isolation Forest** - Finds anomalies by isolating them from normal data
- **Autoencoder** - Uses neural networks to learn normal patterns and flag deviations

**Supervised Models** (need labeled data):
- **Random Forest** - Uses decision trees to classify data
- **LightGBM** - A fast and efficient gradient boosting model
- **Deep Neural Network** - A deep learning model with multiple layers

---

## Project Structure

```
Anomaly Detection Studio/
│
├── app.py                 # Main Flask server (backend)
├── requirements.txt       # Python packages needed
├── README.md             # This file
│
├── templates/            # Frontend HTML files
│   └── index.html        # Main webpage
│
└── static/              # Frontend assets
    ├── style.css        # Styling and design
    ├── script.js        # Frontend JavaScript logic
    └── temp/            # Temporary files (preprocessed data)
```

---

## Installation & Setup

### Prerequisites
- **Python 3.11** (required)
- A web browser (Chrome, Firefox, Edge, etc.)
- Basic knowledge of command line/terminal

### Step-by-Step Installation

1. **Download or clone this project** to your computer

2. **Open Command Prompt (Windows) or Terminal (Mac/Linux)**

3. **Navigate to the project folder:**
   ```bash
   cd "D:\Anamoly detection Studio"
   ```

4. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   ```

5. **Activate the virtual environment:**
   - **Windows:**
     ```bash
     venv\Scripts\activate
     ```
   - **Mac/Linux:**
     ```bash
     source venv/bin/activate
     ```

6. **Install required packages:**
   ```bash
   pip install -r requirements.txt
   ```

   This will install:
   - Flask (web framework)
   - TensorFlow (deep learning)
   - scikit-learn (machine learning)
   - pandas (data processing)
   - numpy (numerical operations)
   - And other dependencies

7. **Run the application:**
   ```bash
   python app.py
   ```

8. **Open your browser** and go to:
   ```
   http://127.0.0.1:5000
   ```

You should now see the Anomaly Detection Studio homepage!

---

## How to Use

### Step 1: Upload Your Dataset
1. Click on the file upload area
2. Select one or more CSV or JSON files
3. The system will show how many files you've selected

### Step 2: Configure Your Analysis

**If your data has labels (supervised learning):**
- Enter the name of the target column in the "Target Column" field
- This tells the system which column contains the correct answers

**If your data has no labels (unsupervised learning):**
- Leave the "Target Column" field empty
- The system will automatically detect anomalies

### Step 3: Select Models
Choose one or more models to analyze your data:
- ☑️ **Isolation Forest** - Good for general anomaly detection
- ☑️ **Autoencoder** - Great for complex patterns
- ☑️ **Random Forest** - Best when you have labeled data
- ☑️ **LightGBM** - Fast and accurate for supervised tasks
- ☑️ **Deep Neural Network** - Powerful for complex patterns

### Step 4: Set Contamination (Optional)
- **Fixed Contamination**: Enter a value between 0 and 1 (e.g., 0.1 = 10% anomalies expected)
- **Auto Threshold**: Let the system automatically determine the threshold

### Step 5: Analyze
1. Click the **"Analyze"** button
2. Wait for processing (time depends on file size)
3. You can cancel the analysis if needed

### Step 6: View Results
After analysis completes, you'll see:
- **Comparison Chart**: Visual bar chart showing normal vs anomalous samples
- **Detailed Results Table**: Shows metrics for each model:
  - Accuracy
  - Precision
  - Recall
  - F1-Score
  - Contamination used
  - Percentage of normal and anomalous samples
- **Best Model**: Automatically highlighted if multiple models are used
- **Download Options**: Export results or download preprocessed data

---

## Technical Details

### How Data Processing Works

1. **File Reading**
   - The system reads CSV or JSON files
   - Automatically detects data types (numbers, text, etc.)

2. **Data Cleaning**
   - **Missing Values**: Filled using mean values for numbers
   - **Categorical Data**: Converted to numbers using:
     - One-Hot Encoding (for categories with ≤50 unique values)
     - Label Encoding (for categories with 51-500 unique values)
     - Hashing Encoding (for categories with >500 unique values)

3. **Feature Scaling**
   - All features are standardized (mean=0, std=1)
   - This ensures all features are on the same scale

4. **Model Training**
   - Each selected model is trained on your data
   - Unsupervised models learn patterns automatically
   - Supervised models learn from your labels

5. **Prediction & Evaluation**
   - Models predict which samples are anomalies
   - If labels exist, metrics are calculated (accuracy, precision, recall, F1)
   - Results are formatted and sent back to the frontend

### Model Details

#### Isolation Forest
- **How it works**: Randomly isolates data points in trees. Anomalies are easier to isolate.
- **Best for**: General purpose anomaly detection
- **Parameters**: Contamination rate (expected % of anomalies)

#### Autoencoder
- **How it works**: Neural network that learns to compress and reconstruct data. High reconstruction error = anomaly.
- **Best for**: Complex patterns and non-linear relationships
- **Parameters**: Contamination rate or auto threshold

#### Random Forest
- **How it works**: Multiple decision trees vote on predictions
- **Best for**: Supervised learning with labeled data
- **Requirements**: Target column must be provided

#### LightGBM
- **How it works**: Gradient boosting algorithm that builds models sequentially
- **Best for**: Fast and accurate supervised learning
- **Requirements**: Target column must be provided

#### Deep Neural Network
- **How it works**: Multi-layer neural network with 64→32→1 neurons
- **Best for**: Complex supervised learning tasks
- **Requirements**: Target column must be provided

### API Endpoints

- **GET /** - Serves the main webpage
- **POST /analyze** - Receives files and model selections, returns analysis results

### Data Flow

```
User Uploads File
    ↓
Frontend (JavaScript) sends to Backend
    ↓
Backend (Flask) receives file
    ↓
Data Preprocessing (cleaning, encoding, scaling)
    ↓
Model Training & Prediction
    ↓
Calculate Metrics & Statistics
    ↓
Return JSON Results
    ↓
Frontend Displays Results (tables, charts)
```

---

## Features

### ✨ Core Features

1. **Multi-File Support**
   - Upload and analyze multiple datasets at once
   - Compare results across different files

2. **Automatic Preprocessing**
   - No need to clean data manually
   - Handles missing values, encoding, and scaling automatically

3. **Model Comparison**
   - Run multiple models simultaneously
   - Side-by-side comparison of results
   - Best model automatically highlighted

4. **Interactive Visualizations**
   - Dynamic bar charts using Chart.js
   - Visual representation of normal vs anomalous samples
   - Color-coded results for easy understanding

5. **Export Functionality**
   - Export results as CSV
   - Download preprocessed datasets
   - Save analysis results for later

6. **Real-time Feedback**
   - Progress indicators during analysis
   - Error messages for invalid inputs
   - Cancel option for long-running analyses

### 🎨 User Interface Features

1. **Modern Design**
   - Dark theme with gradient accents
   - Responsive layout (works on mobile, tablet, desktop)
   - Smooth animations and transitions

2. **Professional Footer**
   - Company information
   - Social media links
   - Animated statistics counter
   - CEO information display
   - Typewriter effect for branding

3. **User-Friendly**
   - Clear instructions and labels
   - Helpful error messages
   - Intuitive navigation

### 🔧 Technical Features

1. **Concurrent Processing**
   - Multiple files processed in parallel
   - Faster analysis times

2. **Error Handling**
   - Graceful error messages
   - Validation of inputs
   - Safe file handling

3. **Temporary File Management**
   - Automatic cleanup of temporary files
   - Secure file storage

---

## About

**Anomaly Detection Studio** is developed and maintained by **CodeNest Tech Solutions**.

- **Website**: [https://codenesthub.vercel.app/](https://codenesthub.vercel.app/)
- **CEO**: Syed Muhammad Hussnain Bukhari

### Technologies Used

- **Backend**: Python, Flask
- **Frontend**: HTML5, CSS3, JavaScript
- **Machine Learning**: TensorFlow, scikit-learn, LightGBM
- **Data Processing**: pandas, numpy
- **Visualization**: Chart.js
- **Icons**: Font Awesome

---

## Troubleshooting

### Common Issues

**Problem**: "No module named 'flask'"
- **Solution**: Make sure you've activated your virtual environment and installed requirements.txt

**Problem**: Port 5000 already in use
- **Solution**: Change the port in app.py (line 266) or close the other application using port 5000

**Problem**: Analysis takes too long
- **Solution**: This is normal for large files. Try with smaller datasets first or use faster models like LightGBM

**Problem**: "Invalid contamination value"
- **Solution**: Contamination must be a number between 0 and 1 (e.g., 0.1 for 10%)

**Problem**: Models not working
- **Solution**: Make sure you've selected at least one model and provided target column for supervised models

---

## License

This project is proprietary software developed by CodeNest Tech Solutions.

---

## Support

For issues, questions, or feature requests, please contact CodeNest Tech Solutions through their website.

---

**Happy Anomaly Detecting! 🚀**

## Sample data

`Dataset/bankstatements.csv` is a sample bank-statement dataset for trying the app. Payee names are anonymised (`PAYEE_001` and so on).

---

<div align="center">

**Built by [Ch Muhammad Samiullah](https://github.com/samiullah156-creator)** · AI Automation Engineer and Full-Stack Developer at [Lexvaxa](https://lexvaxa.com)

<a href="https://github.com/samiullah156-creator"><img src="https://img.shields.io/badge/More%20projects-181717?style=for-the-badge&logo=github&logoColor=white" alt="More projects" /></a>
<a href="https://lexvaxa.com/contact"><img src="https://img.shields.io/badge/Work%20with%20me-167dfe?style=for-the-badge&logo=googlecalendar&logoColor=white" alt="Work with me" /></a>
<a href="https://www.linkedin.com/in/sami-lexvaxa/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>

<sub>⭐ Star this repo if you found it useful</sub>

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:9533fa,50:167dfe,100:1d1726&height=110&section=footer" width="100%" alt="" />
