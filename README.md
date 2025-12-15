# Archiving Microservice

This project is an archiving microservice designed to store and manage historical data efficiently.

## Tech Stack

- **Language**: Python 3.9
- **Framework**: Flask
- **Database**: MongoDB
- **Cloud Storage**: AWS S3
- **Caching**: Redis
- **Search**: Elasticsearch
- **Containerization**: Docker

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd archiving_microservice
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Set up Environment Variables:**
    Create a `.env` file in the root directory and add the following variables:
    ```
    MONGO_URI="mongodb://localhost:27017/"
    AWS_ACCESS_KEY_ID="YOUR_AWS_KEY"
    AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET"
    S3_BUCKET_NAME="your-s3-bucket-name"

# Email Configuration
SMTP_SERVER="smtp.example.com"
SMTP_PORT=587
SMTP_USERNAME="your-email@example.com"
SMTP_PASSWORD="your-email-password"
SENDER_EMAIL="noreply@example.com"

    ```

4.  **Run the application:**
    ```bash
    python app.py
    ```
The service will be running at `http://127.0.0.1:5000`.

## How to use Docker

1.  **Build the Docker image:**
    ```bash
    docker build -t archiving-microservice .
    ```

2.  **Run the Docker container:**
    ```bash
    docker run -p 5000:5000 archiving-microservice
    ```