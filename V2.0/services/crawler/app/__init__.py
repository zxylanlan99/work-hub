"""StudyMind crawler-service package.

Responsibilities:
  * RSS 抓取 + 逐篇正文抽取 (extract)
  * 红线引擎 R1-R5 (redline)
  * SSRF / 来源防护 (ssrf)
  * 联网搜索 (fetch_rss.search_web)
  * 对外 router (routers/crawler.py)

C2 硬约束: 无正文资讯一律不通过红线 (R2), 不入库、不推荐。
"""
