FROM python:3.12-slim
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["python", "server.py"]