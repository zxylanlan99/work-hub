// 首页仪表盘（T10，保留清单 #8 / V2-HOME-001 四聚合基线）
// 复用 data-service 四个聚合接口：heatmap / today-review / weak-topics / plan-stats。
// 图表全部用原生 CSS/SVG，不引入图表库。
import React from "react";
import { Link } from "react-router-dom";
import { homeApi } from "../lib/api/home";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Spinner,
  Banner,
  Badge,
} from "../components/ui";
import type { HeatmapItem, ReviewCard, WeakTopic } from "../types";

interface HomeBundle {
  heatmap: { items: HeatmapItem[] };
  today: { count: number; items: ReviewCard[] };
  weak: { topics: WeakTopic[] };
  plan: { total: number; completed: number; active: number; completion_rate: number };
}

export default function HomePage() {
  const { data, loading, error } = useAsyncData<HomeBundle>(async () => {
    const [heatmap, today, weak, plan] = await Promise.all([
      homeApi.heatmap(),
      homeApi.todayReview(),
      homeApi.weakTopics(),
      homeApi.planStats(),
    ]);
    return { heatmap, today, weak, plan };
  }, []);

  if (loading) return <Spinner center />;
  if (error)
    return (
      <Banner kind="error">
        加载首页数据失败：{error}（请确认 data-service :8000 已启动）
      </Banner>
    );
  if (!data) return null;

  const items = data.heatmap?.items ?? [];
  const totalCount = items.reduce((s, it) => s + (it.count || 0), 0);
  const weeks = Math.max(1, Math.ceil(items.length / 7));
  const todayItems = data.today?.items ?? [];
  const weakTopics = data.weak?.topics ?? [];
  const plan = data.plan ?? {
    total: 0,
    completed: 0,
    active: 0,
    completion_rate: 0,
  };

  return (
    <div>
      <div className="page-head">
        <h1>首页</h1>
        <p>学习仪表盘 · 热力图 / 待复习 / 薄弱主题 / 计划统计</p>
      </div>

      {/* 四张统计卡 */}
      <div className="grid grid-4">
        <Card>
          <CardBody>
            <div className="stat-num">{data.today?.count ?? 0}</div>
            <div className="stat-label">今日待复习</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="stat-num">
              {Math.round((plan.completion_rate ?? 0) * 100)}%
            </div>
            <div className="stat-label">
              计划完成率（{plan.completed}/{plan.total}）
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="stat-num">{weakTopics.length}</div>
            <div className="stat-label">薄弱主题（掌握度偏低）</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="stat-num">{totalCount}</div>
            <div className="stat-label">累计学习记录</div>
          </CardBody>
        </Card>
      </div>

      {/* 热力图 */}
      <Card>
        <CardHead
          title="学习热力图"
          extra={<Badge tone="bamboo">近 {weeks} 周</Badge>}
        />
        <CardBody>
          {items.length === 0 ? (
            <div className="muted">暂无学习记录。</div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridAutoFlow: "column",
                  gridTemplateRows: "repeat(7, 1fr)",
                  gridTemplateColumns: `repeat(${weeks}, 1fr)`,
                  gap: 4,
                  maxWidth: 720,
                }}
              >
                {items.map((it) => (
                  <div
                    key={it.date}
                    className={`hm-cell hm-l${it.level ?? 0}`}
                    title={`${it.date} · ${it.count} 次`}
                  />
                ))}
              </div>
              <div className="heat-legend">
                <span>少</span>
                <span className="dot hm-l0" />
                <span className="dot hm-l1" />
                <span className="dot hm-l2" />
                <span className="dot hm-l3" />
                <span>多</span>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* 今日待复习 + 薄弱主题 */}
      <div className="grid grid-2">
        <Card>
          <CardHead
            title="今日待复习"
            extra={
              <Link to="/review" className="btn btn-sm btn-secondary">
                去复习
              </Link>
            }
          />
          <CardBody>
            {todayItems.length === 0 ? (
              <div className="muted">今天没有待复习卡片，继续保持！</div>
            ) : (
              <div className="list">
                {todayItems.slice(0, 6).map((c) => (
                  <div key={c.id} className="item">
                    <div className="item-title">{c.question}</div>
                    <div className="item-meta">
                      <Badge>{c.card_type}</Badge>
                      {c.due_date ? <span>到期 {c.due_date.slice(0, 10)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title="薄弱主题"
            extra={
              <Link to="/review" className="btn btn-sm btn-secondary">
                复习建议
              </Link>
            }
          />
          <CardBody>
            {weakTopics.length === 0 ? (
              <div className="muted">暂无薄弱主题。</div>
            ) : (
              <div className="list">
                {weakTopics.slice(0, 6).map((t) => (
                  <div key={t.name} className="item">
                    <div className="row-between">
                      <span className="item-title">{t.name}</span>
                      <span className="muted">
                        {Math.round((t.mastery ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="bar bar-cinnabar" style={{ marginTop: 8 }}>
                      <span style={{ width: `${Math.round((t.mastery ?? 0) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
