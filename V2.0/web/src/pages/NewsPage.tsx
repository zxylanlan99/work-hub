// 资讯（T13，保留清单 #6 浏览/已读 / #7 收藏 / V2-NEWS-001 红线）
// 列表 + 已读切换 + 收藏切换 + 「抓取资讯」（只显示 passed，rejected 标红原因，遵守 C2）
// + 红线自检展示。
import React, { useState } from "react";
import { newsApi } from "../lib/api/news";
import { crawlerApi } from "../lib/api/crawler";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Input,
  Textarea,
  Banner,
  Badge,
  Spinner,
  Empty,
} from "../components/ui";
import type { NewsItem, RssFetchResult, RedlineCheckResult, RecommendWeights } from "../types";

type Tab = "all" | "favorites";

export default function NewsPage() {
  const allState = useAsyncData<NewsItem[]>(() => newsApi.list(), []);
  const favState = useAsyncData<NewsItem[]>(() => newsApi.favorites(), []);
  const [tab, setTab] = useState<Tab>("all");

  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<RssFetchResult | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  // 红线自检
  const [checkForm, setCheckForm] = useState({ url: "", title: "", content: "" });
  const [checkResult, setCheckResult] = useState<RedlineCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  // T16 V2-NEWS-003：推荐维度权重配置
  const [weights, setWeights] = useState<RecommendWeights>({
    relevance: 1,
    recency: 0.8,
    authority: 0.8,
    completeness: 0.7,
    dedup: 0.6,
  });
  const [recResult, setRecResult] = useState<NewsItem[] | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const list = tab === "favorites" ? favState.data ?? [] : allState.data ?? [];
  const loading = tab === "favorites" ? favState.loading : allState.loading;
  const error = tab === "favorites" ? favState.error : allState.error;

  function reloadAll() {
    allState.reload();
    favState.reload();
  }

  async function toggleRead(it: NewsItem) {
    await newsApi.toggleRead(it.id);
    reloadAll();
  }
  async function toggleFav(it: NewsItem) {
    await newsApi.toggleFavorite(it.id);
    reloadAll();
  }

  async function runFetch() {
    setFetching(true);
    setFetchErr(null);
    try {
      const res = await crawlerApi.fetchRss();
      setFetchResult(res);
      allState.reload();
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await crawlerApi.redlineCheck(checkForm);
      setCheckResult(res);
    } finally {
      setChecking(false);
    }
  }

  async function runRecommend() {
    setRecLoading(true);
    setRecError(null);
    try {
      const res = await newsApi.recommend(weights);
      setRecResult(res);
    } catch (e) {
      setRecError(e instanceof Error ? e.message : String(e));
      setRecResult([]);
    } finally {
      setRecLoading(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>资讯</h1>
        <p>资讯浏览 / 已读 / 收藏 · 红线通过-拦截（C2）· 收藏夹</p>
      </div>

      <div className="row row-between" style={{ marginBottom: 16 }}>
        <div className="row">
          <Button variant={tab === "all" ? "primary" : "secondary"} size="sm" onClick={() => setTab("all")}>
            全部
          </Button>
          <Button variant={tab === "favorites" ? "primary" : "secondary"} size="sm" onClick={() => setTab("favorites")}>
            收藏夹
          </Button>
        </div>
        <Button onClick={runFetch} disabled={fetching}>
          {fetching ? "抓取中…" : "抓取资讯"}
        </Button>
      </div>

      {fetchErr ? <Banner kind="error">抓取失败：{fetchErr}</Banner> : null}

      {/* 抓取结果：只显示 passed，rejected 标红原因 */}
      {fetchResult ? (
        <Card>
          <CardHead title="本次抓取结果" />
          <CardBody>
            <div className="muted" style={{ marginBottom: 8 }}>
              通过 <b className="text-bamboo">{fetchResult.passed.length}</b> 条 · 拦截{" "}
              <b className="text-cinnabar">{fetchResult.rejected.length}</b> 条（仅展示通过项，拦截项标红原因，遵守 C2）
            </div>
            {fetchResult.passed.length > 0 ? (
              <div className="list">
                {fetchResult.passed.map((it, i) => (
                  <div key={it.id ?? i} className="item">
                    <div className="item-title">{it.title}</div>
                    <div className="item-meta">
                      <span>{it.source}</span>
                      <Badge tone="bamboo">通过</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">本次无通过项。</div>
            )}
            {fetchResult.rejected.length > 0 ? (
              <div className="list" style={{ marginTop: 12 }}>
                {fetchResult.rejected.map((r, i) => (
                  <div
                    key={i}
                    className="item"
                    style={{ borderColor: "var(--cinnabar-soft)", borderStyle: "dashed" }}
                  >
                    <div className="item-title text-cinnabar" style={{ textDecoration: "line-through" }}>
                      {r.title ?? r.url ?? "未命名"}
                    </div>
                    <div className="item-meta text-cinnabar">拦截原因：{r.reason}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 推荐维度权重（T16 V2-NEWS-003） */}
      <Card>
        <CardHead title="推荐维度权重" />
        <CardBody>
          <div className="muted" style={{ marginBottom: 10 }}>
            调整各维度权重后获取个性化推荐（调 POST /api/news/recommend）。
          </div>
          <div className="grid grid-2">
            {(
              [
                ["relevance", "相关度"],
                ["recency", "时效性"],
                ["authority", "权威性"],
                ["completeness", "完整度"],
                ["dedup", "去重"],
              ] as Array<[keyof RecommendWeights, string]>
            ).map(([key, label]) => (
              <Field key={key} label={`${label} · ${weights[key].toFixed(1)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))
                  }
                  style={{ width: "100%" }}
                />
              </Field>
            ))}
          </div>
          <Button onClick={runRecommend} disabled={recLoading}>
            {recLoading ? "推荐中…" : "获取推荐"}
          </Button>
          {recError ? (
            <Banner kind="error">
              推荐失败：{recError}（后端 /api/news/recommend 待 T17 实现）
            </Banner>
          ) : null}
          {recResult && recResult.length > 0 ? (
            <div className="list" style={{ marginTop: 12 }}>
              {recResult.map((it) => (
                <div key={it.id} className="item">
                  <div className="row-between">
                    <a className="item-title" href={it.url} target="_blank" rel="noreferrer">
                      {it.title}
                    </a>
                  </div>
                  <div className="item-meta">
                    <span>{it.source}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : recResult ? (
            <div className="muted" style={{ marginTop: 12 }}>
              无推荐结果。
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* 红线自检 */}
      <Card>
        <CardHead title="红线自检（本地预检）" />
        <CardBody>
          <div className="grid grid-3">
            <Field label="URL">
              <Input value={checkForm.url} onChange={(e) => setCheckForm({ ...checkForm, url: e.target.value })} />
            </Field>
            <Field label="标题">
              <Input value={checkForm.title} onChange={(e) => setCheckForm({ ...checkForm, title: e.target.value })} />
            </Field>
            <div className="field">
              <span className="field-label">操作</span>
              <Button onClick={runCheck} disabled={checking} style={{ alignSelf: "flex-end" }}>
                {checking ? "检查中…" : "检查红线"}
              </Button>
            </div>
          </div>
          <Field label="正文">
            <Textarea
              value={checkForm.content}
              onChange={(e) => setCheckForm({ ...checkForm, content: e.target.value })}
              placeholder="粘贴待入库资讯正文，服务端点 /api/crawler/redline/check 执行 R1-R5"
            />
          </Field>
          {checkResult ? (
            checkResult.passed ? (
              <Banner kind="info">通过红线检查，可入库。</Banner>
            ) : (
              <Banner kind="error">未通过：{checkResult.reasons.join("；")}</Banner>
            )
          ) : null}
        </CardBody>
      </Card>

      {/* 资讯列表 */}
      <Card>
        <CardHead title={tab === "favorites" ? "收藏夹" : "资讯列表"} />
        <CardBody>
          {loading ? (
            <Spinner center />
          ) : error ? (
            <Banner kind="error">加载失败：{error}</Banner>
          ) : list.length === 0 ? (
            <Empty
              title={tab === "favorites" ? "收藏夹为空" : "暂无资讯"}
              hint={tab === "favorites" ? "在列表中点击「收藏」。" : "点击「抓取资讯」获取最新内容。"}
            />
          ) : (
            <div className="list">
              {list.map((it) => (
                <div key={it.id} className="item">
                  <div className="row-between">
                    <a className="item-title" href={it.url} target="_blank" rel="noreferrer">
                      {it.title}
                    </a>
                    <div className="row">
                      {it.has_read ? <Badge tone="bamboo">已读</Badge> : <Badge>未读</Badge>}
                      {it.is_favorited ? <Badge tone="amber">已收藏</Badge> : null}
                    </div>
                  </div>
                  <div className="item-meta">
                    <span>{it.source}</span>
                    {it.summary ? <span>{it.summary.slice(0, 60)}</span> : null}
                  </div>
                  <div className="item-actions">
                    <Button size="sm" variant="secondary" onClick={() => toggleRead(it)}>
                      {it.has_read ? "标为未读" : "标为已读"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => toggleFav(it)}>
                      {it.is_favorited ? "取消收藏" : "收藏"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
