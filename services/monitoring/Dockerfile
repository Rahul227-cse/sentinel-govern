FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY monitoring_api.py .
COPY reference_data.csv .
COPY reference_credit_risk.csv .
COPY reference_insurance.csv .

EXPOSE 8001

CMD ["uvicorn", "monitoring_api:app", "--host", "0.0.0.0", "--port", "8001"]
