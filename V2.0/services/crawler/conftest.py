"""pytest 配置: 将 crawler 目录加入 sys.path, 使 `import app` 可用。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
