#!/usr/bin/env python3
"""本地静态服务（带 CORS 头、禁缓存），用于在本机酒馆里测试从别的端口 import 的脚本。
用法：python3 cors_server.py <端口> <目录>
"""
import http.server, sys, functools


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
