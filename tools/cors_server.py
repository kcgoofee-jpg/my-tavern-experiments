#!/usr/bin/env python3
"""本地静态服务（带 CORS 头、禁缓存），用于在本机酒馆里测试从别的端口 import 的脚本。
用法：python3 cors_server.py <端口> <目录>
GET /__root 返回所服务目录的真实路径（tools/browser/lib.mjs 用来确认端口上跑的是不是本工作树）。
"""
import http.server, sys, functools, os


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/__root':
            b = os.path.realpath(self.directory).encode('utf-8')
            self.send_response(200); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        super().do_GET()


port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
