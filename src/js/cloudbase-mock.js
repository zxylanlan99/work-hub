/**
 * CloudBase Mock SDK - 用于本地开发测试
 * 模拟 CloudBase SDK 的核心功能，使用 localStorage 存储数据
 */
(function() {
  'use strict';

  // 存储键名
  const STORAGE_KEY = 'studymind_db';

  // 获取存储数据
  function getStoredData() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  // 保存数据
  function saveStoredData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // 生成唯一 ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Mock 数据库集合
  class MockCollection {
    constructor(name) {
      this.name = name;
    }

    // 获取集合数据
    _getCollectionData() {
      const data = getStoredData();
      return data[this.name] || [];
    }

    // 保存集合数据
    _saveCollectionData(items) {
      const data = getStoredData();
      data[this.name] = items;
      saveStoredData(data);
    }

    // where 查询
    where(query) {
      this._query = query;
      return this;
    }

    // 排序
    orderBy(field, direction = 'asc') {
      this._orderBy = { field, direction };
      return this;
    }

    // 限制数量
    limit(count) {
      this._limit = count;
      return this;
    }

    // 跳过
    skip(count) {
      this._skip = count;
      return this;
    }

    // 获取数据
    async get() {
      console.log(`[MockDB] 📡 ${this.name}.get() 调用`);
      let items = this._getCollectionData();
      console.log(`[MockDB] 📊 ${this.name} 集合原始数据:`, { count: items.length, items: items.slice(0, 5) });

      // 应用 where 查询
      if (this._query) {
        items = items.filter(item => {
          return Object.keys(this._query).every(key => {
            const queryVal = this._query[key];
            const itemVal = item[key];
            if (queryVal && typeof queryVal === 'object' && queryVal.$gte) {
              return itemVal >= queryVal.$gte;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$lte) {
              return itemVal <= queryVal.$lte;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$lt) {
              return itemVal < queryVal.$lt;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$gt) {
              return itemVal > queryVal.$gt;
            }
            return itemVal === queryVal;
          });
        });
      }

      // 应用排序
      if (this._orderBy) {
        const { field, direction } = this._orderBy;
        items.sort((a, b) => {
          const aVal = a[field];
          const bVal = b[field];
          if (aVal < bVal) return direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // 应用跳过
      if (this._skip) {
        items = items.slice(this._skip);
      }

      // 应用限制
      if (this._limit) {
        items = items.slice(0, this._limit);
      }

      // 重置查询条件
      this._query = null;
      this._orderBy = null;
      this._limit = null;
      this._skip = null;

      console.log(`[MockDB] 📊 ${this.name}.get() 返回:`, { count: items.length, items: items.slice(0, 3) });
      return { data: items, total: items.length };
    }

    // 计数
    async count() {
      console.log(`[MockDB] 📡 ${this.name}.count() 调用`);
      let items = this._getCollectionData();
      console.log(`[MockDB] 📊 ${this.name} 集合原始数据量:`, items.length);

      // 应用 where 查询
      if (this._query) {
        items = items.filter(item => {
          return Object.keys(this._query).every(key => {
            const queryVal = this._query[key];
            const itemVal = item[key];
            if (queryVal && typeof queryVal === 'object' && queryVal.$gte) {
              return itemVal >= queryVal.$gte;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$lte) {
              return itemVal <= queryVal.$lte;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$lt) {
              return itemVal < queryVal.$lt;
            }
            if (queryVal && typeof queryVal === 'object' && queryVal.$gt) {
              return itemVal > queryVal.$gt;
            }
            return itemVal === queryVal;
          });
        });
      }

      // 重置查询条件
      this._query = null;

      console.log(`[MockDB] 📊 ${this.name}.count() 返回:`, { total: items.length });
      return { total: items.length };
    }

    // 添加数据
    async add(data) {
      console.log(`[MockDB] 📡 ${this.name}.add() 写入:`, data);
      const items = this._getCollectionData();
      const newItem = {
        _id: generateId(),
        _openid: 'mock-user-' + Date.now(),
        ...data,
        createdAt: data.createdAt || new Date(),
        updatedAt: data.updatedAt || new Date()
      };
      items.push(newItem);
      this._saveCollectionData(items);
      console.log(`[MockDB] ✅ ${this.name}.add() 成功, ID:`, newItem._id);
      return { id: newItem._id };
    }

    // 获取文档引用
    doc(id) {
      return new MockDocRef(this, id);
    }
  }

  // Mock 文档引用
  class MockDocRef {
    constructor(collection, id) {
      this.collection = collection;
      this.id = id;
    }

    // 获取文档
    async get() {
      console.log(`[MockDB] 📡 ${this.collection.name}.doc(${this.id}).get() 调用`);
      const items = this.collection._getCollectionData();
      const item = items.find(i => i._id === this.id);
      console.log(`[MockDB] 📊 ${this.collection.name}.doc(${this.id}) 查询结果:`, item ? '找到' : '未找到');
      return { data: item ? [item] : [] };
    }

    // 更新文档
    async update(data) {
      console.log(`[MockDB] 📡 ${this.collection.name}.doc(${this.id}).update() 写入:`, data);
      const items = this.collection._getCollectionData();
      const index = items.findIndex(i => i._id === this.id);
      if (index !== -1) {
        items[index] = { ...items[index], ...data, updatedAt: new Date() };
        this.collection._saveCollectionData(items);
        console.log(`[MockDB] ✅ ${this.collection.name}.doc(${this.id}).update() 成功`);
        return { updated: 1 };
      }
      console.log(`[MockDB] ⚠️ ${this.collection.name}.doc(${this.id}).update() 未找到文档`);
      return { updated: 0 };
    }

    // 删除文档
    async remove() {
      console.log(`[MockDB] 📡 ${this.collection.name}.doc(${this.id}).remove() 调用`);
      const items = this.collection._getCollectionData();
      const filtered = items.filter(i => i._id !== this.id);
      this.collection._saveCollectionData(filtered);
      console.log(`[MockDB] ✅ ${this.collection.name}.doc(${this.id}).remove() 成功`);
      return { deleted: 1 };
    }
  }

  // Mock 数据库命令
  const mockCommand = {
    gte: (val) => ({ $gte: val }),
    lte: (val) => ({ $lte: val }),
    lt: (val) => ({ $lt: val }),
    gt: (val) => ({ $gt: val }),
    and: (...conditions) => ({ $and: conditions }),
    or: (...conditions) => ({ $or: conditions })
  };

  // Mock 数据库
  class MockDatabase {
    constructor() {
      this.command = mockCommand;
    }

    collection(name) {
      return new MockCollection(name);
    }

    RegExp({ regexp, options }) {
      return { $regex: regexp, $options: options };
    }
  }

  // Mock 认证
  class MockAuth {
    anonymousAuthProvider() {
      return {
        signIn: async () => {
          console.log('Mock: Anonymous sign in');
          return { user: { uid: 'mock-user-' + Date.now() } };
        }
      };
    }

    signInAnonymously() {
      console.log('Mock: signInAnonymously');
      return Promise.resolve({ user: { uid: 'mock-user-' + Date.now() } });
    }
  }

  // Mock 应用
  class MockApp {
    constructor() {
      this.auth = () => new MockAuth();
    }

    database() {
      return new MockDatabase();
    }

    async callFunction({ name, data }) {
      console.log(`Mock: callFunction(${name})`, data);
      // 【Issue 6 修复】AI相关云函数禁止返回模拟数据，直接返回错误
      if (name === 'ai-proxy' || name === 'ai' || (data && data.action && data.action.startsWith && (data.action.startsWith('goal-') || data.action.startsWith('chat') || data.action === 'quiz-generate'))) {
        return { result: { success: false, error: 'Mock SDK 不支持 AI 调用，请配置真实 CloudBase SDK 和 AI 模型' } };
      }
      return { result: { success: true, content: 'Mock response' } };
    }
  }

  // 立即挂载 Mock SDK 到 window.cloudbase
  window.cloudbase = {
    init: function() {
      console.log('[CloudBase] 初始化 Mock SDK');
      return new MockApp();
    }
  };

  // 检查真实 CloudBase SDK 是否已正确加载
  if (window.TCB && typeof window.TCB.init === 'function') {
    console.log('[CloudBase] ✅ 真实 CloudBase SDK 已加载，替换为真实 SDK');
    window.cloudbase = window.TCB;
  } else {
    console.warn('[CloudBase] ⚠️ CloudBase SDK CDN 未加载，使用 Mock 模式（localStorage 存储）');
  }

  // 模拟 CONFIG
  if (!window.CONFIG) {
    window.CONFIG = {
      cloudbase: {
        env: 'studymind-d7g06nv0de98a1f1b',
        region: 'ap-shanghai'
      }
    };
  }

  console.log('✅ CloudBase Mock SDK loaded');
})();
