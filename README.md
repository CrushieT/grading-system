# Grading System

## Requirements
- Python 3.12+
- Git

## Setup

### 1. Clone the repo
git clone https://github.com/yourusername/grading-system.git
cd grading-system

### 2. Create virtual environment
python -m venv venv

### 3. Activate virtual environment
# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

### 4. Install dependencies
pip install -r requirements.txt

### 5. Run migrations
python manage.py migrate

### 6. Create teacher account
python manage.py createsuperuser

### 7. Run the server
python manage.py runserver

### 8. Open the app
http://127.0.0.1:8000

This route now redirects to `http://127.0.0.1:8000/login.html`.
