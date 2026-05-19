#!/usr/bin/env python3
"""
Simple HTTP server to test the German Vocabulary Practice app locally.
Run this script and open http://localhost:8000 in your browser.
"""

import http.server
import socket
import socketserver
import webbrowser
import os
import sys

PORT = 8000


def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress default logging
        pass

def main():
    # Change to the directory where this script is located
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    Handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            local_ip = get_local_ip()
            print(f"Server starting at http://localhost:{PORT}")
            print(f"Serving files from: {os.getcwd()}")
            print(f"\nPa computer: http://localhost:{PORT}")
            if local_ip:
                print(f"Pa telefon (samme Wi-Fi): http://{local_ip}:{PORT}")
            print("\nTelefon: brug Chrome (Android) eller Safari (iPhone).")
            print("Tillad mikrofon naar appen beder om det.")
            print("Hvis mikrofonen ikke virker over Wi-Fi, prov HTTPS (se TESTING.md).")
            print("\nTryk Ctrl+C for at stoppe serveren\n")
            
            # Try to open browser automatically
            try:
                webbrowser.open(f'http://localhost:{PORT}')
            except:
                pass
            
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98 or e.errno == 10048:  # Address already in use
            print(f"❌ Port {PORT} is already in use.")
            print(f"   Try a different port or close the application using port {PORT}")
            sys.exit(1)
        else:
            raise
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped. Goodbye!")
        sys.exit(0)

if __name__ == "__main__":
    main()
