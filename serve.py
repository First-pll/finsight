# FinSight local server - no-cache headers so browsers always get the latest files
import http.server
import socketserver
import os

os.chdir(r'E:\Hermes\finsight')

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    with Server(('127.0.0.1', 8080), Handler) as httpd:
        print('FinSight server: http://127.0.0.1:8080 (no-cache)', flush=True)
        httpd.serve_forever()
