#!/bin/sh
set -e

HOST_NAME="${1:-riesgo-ia.gt.local}"
CERT_DIR="${2:-/certs}"

cd "$CERT_DIR"

openssl genrsa -out riesgo-ia-local-ca-key.pem 2048
openssl req -new -x509 -days 1825 -key riesgo-ia-local-ca-key.pem -out riesgo-ia-local-ca.pem \
  -subj "/CN=Riesgo IA Local Dev Root"

cat > server.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${HOST_NAME}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${HOST_NAME}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

openssl genrsa -out "${HOST_NAME}-key.pem" 2048
openssl req -new -key "${HOST_NAME}-key.pem" -out server.csr -config server.cnf
openssl x509 -req -in server.csr -CA riesgo-ia-local-ca.pem -CAkey riesgo-ia-local-ca-key.pem \
  -CAcreateserial -out server.pem -days 730 -extensions v3_req -extfile server.cnf

cat server.pem riesgo-ia-local-ca.pem > "${HOST_NAME}.pem"
rm -f server.csr server.pem server.cnf riesgo-ia-local-ca.srl

echo "Certificates written to ${CERT_DIR}"
