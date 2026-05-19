#!/usr/bin/env python3
"""
HTTPS server for phone testing (PWA install + microphone).
Generates a self-signed certificate on first run.
"""

import http.server
import os
import socket
import socketserver
import ssl
import subprocess
import sys

PORT = 8443
CERT_FILE = "dev-cert.pem"
KEY_FILE = "dev-key.pem"


def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def ensure_certificate():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return
    print("Opretter selvsigneret certifikat (kun til test)...")
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", KEY_FILE, "-out", CERT_FILE,
            "-days", "365", "-nodes", "-subj", "/CN=localhost",
        ],
        check=True,
    )


class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    try:
        ensure_certificate()
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("OpenSSL ikke fundet. Installer OpenSSL eller brug start_server.py (HTTP).")
        sys.exit(1)

    Handler = MyHTTPRequestHandler
    httpd = socketserver.TCPServer(("", PORT), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    local_ip = get_local_ip()
    print(f"HTTPS server: https://localhost:{PORT}")
    if local_ip:
        print(f"Pa telefon:     https://{local_ip}:{PORT}")
    print("\nPa telefonen: accepter sikkerhedsadvarslen (selvsigneret certifikat).")
    print("Derefter: Installer app via banner eller Indstillinger.")
    print("Tryk Ctrl+C for at stoppe.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stoppet.")
        sys.exit(0)


if __name__ == "__main__":
    main()
