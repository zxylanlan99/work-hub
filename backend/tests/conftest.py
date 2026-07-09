import os
import sys

# 将 backend/ 加入导入路径，使测试可直接 import news_utils / agent_memory / ai_agent / chunker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
