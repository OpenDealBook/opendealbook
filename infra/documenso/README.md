# Documenso signing certificate

Documenso signs PDFs with a local PKCS#12 certificate. Generate a self-signed one
for local development and place it here as `cert.p12` (the compose file bind-mounts
this directory to `/opt/documenso`):

    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
      -subj "/CN=OpenDealbook Local"
    openssl pkcs12 -export -out infra/documenso/cert.p12 \
      -inkey key.pem -in cert.pem -passout pass:changeit

Set `DOCUMENSO_SIGNING_PASSPHRASE` in `.env` to the passphrase you chose.
This certificate is for local development only; production signing certs live in the
k8-infra secrets store, never in this repo.
