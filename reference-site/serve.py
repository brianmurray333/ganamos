#!/usr/bin/env python3
"""
Simple HTTP server to serve the L402 reference site
Usage: python3 serve.py [port]
"""

import http.server
import socketserver
import sys
import os

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    
    # Change to the reference-site directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Create server
    handler = http.server.SimpleHTTPRequestHandler
    
    # Add CORS headers for development
    class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            super().end_headers()
    
    with socketserver.TCPServer(("", port), CORSHTTPRequestHandler) as httpd:
        print(f"🚀 L402 Reference Site running at http://localhost:{port}")
        print(f"📝 Make sure Ganamos is running at http://localhost:3457")
        print(f"⚡ Ready to test L402 job posting!")
        print(f"\n💡 To stop: Press Ctrl+C")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n👋 Server stopped")

if __name__ == "__main__":
    main()
