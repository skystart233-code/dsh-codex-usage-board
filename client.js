window.__ModuleLoader__.load({
  id: 'dsh-codex-usage-board',
  factory(require) {
    /**
     * Profile-style usage page for Settings.
     *
     * The layout follows a personal-profile reading order: the person first
     * (avatar, name, handle), then five lifetime numbers, then the token
     * activity calendar, the tools that were actually used, the behavioural
     * insights, and finally the recent per-model / per-session detail.
     *
     * Refresh lives in the Settings header action seat so it shares a row with
     * the shipped "open configuration file" action and the close button.
     */
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    /** Locale namespace owned by this plugin. */
    const NS = 'codex-usage-board';

    const en = {
      nav: 'Usage',
      refresh: 'Refresh',
      loading: 'Reading session logs…',
      failed: 'Could not read usage: {message}',
      empty: 'No token usage recorded yet.',
      statTotal: 'Total tokens',
      statPeak: 'Peak day',
      statLongestTask: 'Longest task',
      statLongestStreak: 'Longest streak',
      statCurrentStreak: 'Current streak',
      daysUnit: '{n}d',
      durationHM: '{h}h {m}m',
      durationM: '{m}m',
      durationS: '{s}s',
      activity: 'Token activity',
      metricDay: 'Daily',
      metricWeek: 'Weekly',
      metricCumulative: 'Cumulative',
      less: 'Less',
      more: 'More',
      noActivity: 'No activity calendar available.',
      cellDay: '{date} · {tokens}',
      cellWeek: '{from} – {to} · week {tokens}',
      cellCumulative: 'Through {date} · cumulative {tokens}',
      cellRequests: '{n} requests',
      pickHint: 'Select a cell to see that day.',
      futureHint: 'future date',
      tools: 'Top tools',
      noTools: 'No tool calls recorded yet.',
      insights: 'Insights',
      topEffort: 'Most used reasoning effort',
      notUsed: 'Not used',
      effortMinimal: 'Minimal',
      effortLow: 'Low',
      effortMedium: 'Medium',
      effortHigh: 'High',
      effortXHigh: 'Very high',
      effortMax: 'Max',
      skillsDiscovered: 'Skills explored',
      skillCalls: 'Skill calls',
      toolCalls: 'Tool calls',
      detail: 'Last {n} days',
      byModel: 'By model',
      bySession: 'Top sessions',
      requestsUnit: '{n} requests',
      noModels: 'No model usage in this range.',
      noSessions: 'No session usage in this range.',
      footnote: 'Scanned {scanned} of {sessions} sessions · updated {time}',
      truncated: 'Older sessions are beyond the scan limit and are not counted.',
      profileDefaultName: 'Your usage',
      editProfile: 'Edit profile',
      profileName: 'Name',
      profileHandle: 'Handle',
      profileAvatar: 'Portrait',
      profileAvatarEmpty: 'No portrait',
      chooseImage: 'Upload image',
      removeImage: 'Remove',
      save: 'Save',
      cancel: 'Cancel',
      saving: 'Saving…',
      avatarType: 'Choose a PNG, JPEG, WebP, GIF or SVG image.',
      avatarTooLarge: 'Image must be 256 KB or smaller.',
      profileHint: 'Stored on this machine at ~/.dsh/usage-board/profile.json.',
      profileNamePlaceholder: 'Your name',
      profileHandlePlaceholder: '@handle',
    };

    const zh = {
      nav: '用量',
      refresh: '刷新',
      loading: '正在读取会话日志…',
      failed: '读取用量失败：{message}',
      empty: '还没有 token 用量记录。',
      statTotal: '累计 Token 数',
      statPeak: 'Token 使用峰值',
      statLongestTask: '最长任务用时',
      statLongestStreak: '最长连续天数',
      statCurrentStreak: '当前连续天数',
      daysUnit: '{n} 天',
      durationHM: '{h} 小时 {m} 分',
      durationM: '{m} 分',
      durationS: '{s} 秒',
      activity: 'Token 活动',
      metricDay: '每天',
      metricWeek: '每周',
      metricCumulative: '累计总量',
      less: '少',
      more: '多',
      noActivity: '暂无活动日历。',
      cellDay: '{date} · {tokens}',
      cellWeek: '{from} – {to} · 该周合计 {tokens}',
      cellCumulative: '截至 {date} · 累计 {tokens}',
      cellRequests: '{n} 次请求',
      pickHint: '点击格子查看当天用量。',
      futureHint: '未来日期',
      tools: '常用工具',
      noTools: '还没有工具调用记录。',
      insights: '洞察',
      topEffort: '最常用的推理强度',
      notUsed: '未使用',
      effortMinimal: '极低',
      effortLow: '低',
      effortMedium: '中',
      effortHigh: '高',
      effortXHigh: '极高',
      effortMax: '最高',
      skillsDiscovered: '已探索技能数',
      skillCalls: '使用的技能总数',
      toolCalls: '工具调用总数',
      detail: '近 {n} 天',
      byModel: '按模型',
      bySession: '用量最高的会话',
      requestsUnit: '{n} 次请求',
      noModels: '这个范围内没有模型用量。',
      noSessions: '这个范围内没有会话用量。',
      footnote: '已扫描 {scanned}/{sessions} 个会话 · 更新于 {time}',
      truncated: '更早的会话超出扫描上限，未计入统计。',
      profileDefaultName: '我的用量',
      editProfile: '编辑资料',
      profileName: '名字',
      profileHandle: '账号',
      profileAvatar: '头像',
      profileAvatarEmpty: '未设置头像',
      chooseImage: '上传图片',
      removeImage: '移除',
      save: '保存',
      cancel: '取消',
      saving: '保存中…',
      avatarType: '请选择 PNG、JPEG、WebP、GIF 或 SVG 图片。',
      avatarTooLarge: '图片不能超过 256 KB。',
      profileHint: '保存在本机 ~/.dsh/usage-board/profile.json。',
      profileNamePlaceholder: '你的名字',
      profileHandlePlaceholder: '@账号',
    };

    const CSS = [
      '.dshUsage-root{display:flex;flex-direction:column;gap:36px;width:100%;max-width:860px;margin:0 auto;padding:0 0 12px;color:var(--dsw-alias-label-primary);box-sizing:border-box}',
      '.dshUsage-actionBtn{appearance:none;font:inherit;font-size:13px;line-height:20px;height:28px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}',
      '.dshUsage-actionBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dshUsage-actionBtn:disabled{opacity:.55;cursor:default}',
      '.dshUsage-profile{display:flex;flex-direction:column;align-items:center;text-align:center}',
      '.dshUsage-avatar{width:104px;height:104px;border-radius:50%;object-fit:cover;display:block;background:var(--dsw-alias-bg-layer-2);box-shadow:0 0 0 .5px var(--dsw-alias-border-l1)}',
      '.dshUsage-name{font-size:24px;line-height:32px;font-weight:600;margin-top:14px}',
      '.dshUsage-handle{font-size:14px;line-height:20px;color:var(--dsw-alias-label-secondary);margin-top:2px}',
      '.dshUsage-avatarMark{display:flex;align-items:center;justify-content:center;font-size:36px;line-height:1;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.5px;user-select:none}',
      '.dshUsage-editBtn{appearance:none;font:inherit;font-size:12px;line-height:18px;margin-top:10px;padding:2px 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dshUsage-editBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dshUsage-form{display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;margin-top:14px;text-align:left}',
      '.dshUsage-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dshUsage-label{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshUsage-input{appearance:none;font:inherit;font-size:14px;line-height:20px;height:34px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);min-width:0;box-sizing:border-box}',
      '.dshUsage-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}',
      '.dshUsage-avatarRow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
      '.dshUsage-avatarPreview{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--dsw-alias-bg-layer-2);box-shadow:0 0 0 .5px var(--dsw-alias-border-l1);flex:none}',
      '.dshUsage-formActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}',
      '.dshUsage-btn{appearance:none;font:inherit;font-size:13px;line-height:20px;height:30px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}',
      '.dshUsage-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dshUsage-btn[data-kind=primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.dshUsage-btn[data-kind=primary]:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}',
      '.dshUsage-btn:disabled{opacity:.55;cursor:default}',
      '.dshUsage-file{display:none}',
      '.dshUsage-formError{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '.dshUsage-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshUsage-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}',
      '.dshUsage-stat{position:relative;padding:12px 8px;text-align:center;min-width:0}',
      '.dshUsage-stat + .dshUsage-stat::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);height:22px;border-left:.5px solid var(--dsw-alias-border-l2)}',
      '.dshUsage-statValue{font-size:17px;line-height:24px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshUsage-statLabel{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshUsage-section{display:flex;flex-direction:column;min-width:0}',
      '.dshUsage-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '.dshUsage-sectionTitle{font-size:17px;line-height:24px;font-weight:600}',
      '.dshUsage-seg{display:flex;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);flex:none}',
      '.dshUsage-segBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:3px 9px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.dshUsage-segBtn[data-active=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dshUsage-segBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshUsage-heatScroll{overflow-x:auto;overflow-y:hidden;padding-bottom:2px;scrollbar-width:thin}',
      '.dshUsage-heat{display:inline-flex;flex-direction:column;gap:6px;margin:0 auto;width:max-content}',
      '.dshUsage-weeks{display:flex;gap:3px}',
      '.dshUsage-week{display:flex;flex-direction:column;gap:3px;flex:none}',
      '.dshUsage-cell{width:10px;height:10px;border-radius:2px;flex:none;background:#ebedf0;cursor:pointer;box-sizing:border-box}',
      '.dshUsage-cell[data-future=true]{background:transparent;box-shadow:inset 0 0 0 1px #e6e8eb;cursor:default}',
      '.dshUsage-cell[data-level="1"]{background:#cfe0fb}',
      '.dshUsage-cell[data-level="2"]{background:#9dc2f6}',
      '.dshUsage-cell[data-level="3"]{background:#5a8ff0}',
      '.dshUsage-cell[data-level="4"]{background:#1f5ed6}',
      '.dshUsage-cell[data-selected=true]{box-shadow:0 0 0 1.5px #1f5ed6}',
      '.dshUsage-cell:hover:not([data-future=true]){box-shadow:0 0 0 1px #93b4f5}',
      '.dshUsage-months{display:flex;gap:3px;height:16px}',
      '.dshUsage-month{width:10px;flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dshUsage-heatFoot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;flex-wrap:wrap}',
      '.dshUsage-cellDetail{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);min-height:18px;min-width:0}',
      '.dshUsage-legend{display:flex;align-items:center;gap:4px;font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);flex:none}',
      '.dshUsage-legendCell{width:10px;height:10px;border-radius:2px;background:#ebedf0}',
      '.dshUsage-legendCell[data-level="1"]{background:#cfe0fb}',
      '.dshUsage-legendCell[data-level="2"]{background:#9dc2f6}',
      '.dshUsage-legendCell[data-level="3"]{background:#5a8ff0}',
      '.dshUsage-legendCell[data-level="4"]{background:#1f5ed6}',
      '.dshUsage-chips{display:flex;flex-wrap:wrap;gap:12px}',
      '.dshUsage-chip{display:flex;flex-direction:column;align-items:center;gap:6px;width:64px;min-width:0}',
      '.dshUsage-chipMark{width:42px;height:42px;border-radius:12px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;letter-spacing:.3px;color:var(--dsw-alias-label-secondary);text-transform:uppercase}',
      '.dshUsage-chipName{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshUsage-insights{display:flex;flex-direction:column}',
      '.dshUsage-insight{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:14px;line-height:20px}',
      '.dshUsage-insight:last-child{border-bottom:none}',
      '.dshUsage-insightLabel{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshUsage-insightValue{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.dshUsage-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}',
      '.dshUsage-col{display:flex;flex-direction:column;min-width:0}',
      '.dshUsage-colTitle{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-bottom:2px}',
      '.dshUsage-detail{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:14px;line-height:20px}',
      '.dshUsage-detail:last-child{border-bottom:none}',
      '.dshUsage-detailName{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshUsage-detailValue{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.dshUsage-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshUsage-state{display:flex;align-items:center;justify-content:center;padding:40px 0;font-size:14px;line-height:20px;color:var(--dsw-alias-label-secondary);text-align:center}',
      '.dshUsage-error{color:var(--dsw-alias-state-error-primary)}',
      '@media (max-width:700px){',
      '.dshUsage-root{gap:28px}',
      '.dshUsage-cols{grid-template-columns:minmax(0,1fr);gap:28px}',
      '.dshUsage-stats{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.dshUsage-stat{padding:10px 8px}',
      '.dshUsage-stat + .dshUsage-stat::before{display:none}',
      '.dshUsage-stat:nth-child(2n)::before{display:block}',
      '.dshUsage-stat:nth-child(n+3){border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dshUsage-stat:last-child{grid-column:1 / -1;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dshUsage-avatar{width:88px;height:88px}',
      '.dshUsage-name{font-size:22px;line-height:30px}',
      '}',
    ].join('\n');

    /**
     * Replace `{name}` placeholders in one dictionary string.
     * @param {string} text - dictionary entry.
     * @param {Record<string, unknown>} [params] - placeholder values.
     * @returns {string} the interpolated text.
     */
    function interpolate(text, params) {
      if (params === undefined) return text;
      return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
    }

    /**
     * Bind the locale namespace, falling back to the bundled English copy.
     * @param {Function | undefined} t - slot-injected translator.
     * @param {Record<string, string>} dict - fallback dictionary.
     * @returns {(key: string, params?: Record<string, unknown>) => string} translator.
     */
    function translate(t, dict) {
      return (key, params) => {
        const value = typeof t === 'function' ? t(key, params) : undefined;
        const fallback = interpolate(dict[key] ?? key, params);
        if (typeof value !== 'string' || value.length === 0 || value === key) return fallback;
        return value;
      };
    }

    /** Browser-locale compact number format ("2.29M", "229万", "24.7亿"). */
    const compactFormat = (() => {
      try {
        return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
      } catch {
        return undefined;
      }
    })();

    /**
     * Compact token count in the reader's own unit system.
     * @param {number} value - token count.
     * @returns {string} display text.
     */
    function formatTokens(value) {
      const n = Number(value) || 0;
      if (compactFormat !== undefined) return compactFormat.format(n);
      if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return String(n);
    }

    /**
     * Human task duration.
     * @param {number} ms - duration in milliseconds.
     * @param {Function} t - translator.
     * @returns {string} display text.
     */
    function formatDuration(ms, t) {
      const total = Math.max(0, Number(ms) || 0);
      const minutes = Math.floor(total / 60_000);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return t('durationHM', { h: hours, m: minutes % 60 });
      if (minutes > 0) return t('durationM', { m: minutes });
      return t('durationS', { s: Math.floor(total / 1000) });
    }

    /** Browser-locale short month name, pinned to UTC so a date string never shifts. */
    const monthFormat = (() => {
      try {
        return new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
      } catch {
        return undefined;
      }
    })();

    /**
     * Month label for one `YYYY-MM-DD` date.
     * @param {string} date - ISO date.
     * @returns {string} the localized short month.
     */
    function monthLabel(date) {
      const parts = String(date).split('-').map(Number);
      if (parts.length !== 3 || !parts[0] || !parts[1]) return '';
      if (monthFormat === undefined) return `${parts[1]}`;
      return monthFormat.format(new Date(Date.UTC(parts[0], parts[1] - 1, 1)));
    }

    /**
     * Reasoning-effort label.
     * @param {string} id - effort id from the log.
     * @param {Function} t - translator.
     * @returns {string} display text.
     */
    function effortLabel(id, t) {
      const keys = {
        minimal: 'effortMinimal',
        low: 'effortLow',
        medium: 'effortMedium',
        high: 'effortHigh',
        xhigh: 'effortXHigh',
        max: 'effortMax',
      };
      const key = keys[id];
      return key === undefined ? String(id) : t(key);
    }

    /**
     * Editable profile header.
     *
     * Nothing about the reader is baked into this bundle: the saved profile
     * arrives with the report and the editor posts it back. With no portrait
     * the header falls back to a monogram, and with no name at all it shows a
     * neutral localized label, so a fresh install never looks like someone
     * else's account.
     * @param {{ profile?: object, t: Function, onSaved?: Function }} props - saved profile, translator, save callback.
     * @returns {React.ReactElement} the header, or its inline editor.
     */
    function ProfileHeader(props) {
      const t = props.t;
      const profile = props.profile !== null && typeof props.profile === 'object' ? props.profile : {};
      const savedName = typeof profile.name === 'string' ? profile.name : '';
      const savedHandle = typeof profile.handle === 'string' ? profile.handle : '';
      const savedAvatar = typeof profile.avatar === 'string' ? profile.avatar : '';
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState({ name: '', handle: '', avatar: '' });
      const [status, setStatus] = useState({ saving: false, error: '' });

      /** Show the saved values in the editor rather than the last draft. */
      const openEditor = () => {
        setDraft({ name: savedName, handle: savedHandle, avatar: savedAvatar });
        setStatus({ saving: false, error: '' });
        setEditing(true);
      };

      /**
       * Read the chosen file as a data URL, refusing what the Host would refuse.
       * @param {object} event - change event of the hidden file input.
       * @returns {void}
       */
      const pickAvatar = (event) => {
        const file = event?.target?.files?.[0];
        if (event?.target !== undefined) event.target.value = '';
        if (file === undefined) return;
        if (!/^image\//.test(String(file.type))) {
          setStatus({ saving: false, error: t('avatarType') });
          return;
        }
        if (Number(file.size) > 256 * 1024) {
          setStatus({ saving: false, error: t('avatarTooLarge') });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => setDraft((previous) => ({ ...previous, avatar: String(reader.result) }));
        reader.onerror = () => setStatus({ saving: false, error: t('avatarType') });
        reader.readAsDataURL(file);
        setStatus({ saving: false, error: '' });
      };

      /** Post the draft and close the editor on success. */
      const save = async () => {
        setStatus({ saving: true, error: '' });
        try {
          const url = new URL('api/codex-usage.profile', document.baseURI).toString();
          const response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              name: draft.name,
              handle: draft.handle,
              avatar: draft.avatar === '' ? null : draft.avatar,
            }),
          });
          let body = {};
          try {
            body = await response.json();
          } catch {
            /* a non-JSON failure still reports its status */
          }
          if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
          if (typeof props.onSaved === 'function') props.onSaved(body?.profile ?? null);
          setEditing(false);
          setStatus({ saving: false, error: '' });
        } catch (error) {
          setStatus({ saving: false, error: error instanceof Error ? error.message : String(error) });
        }
      };

      const displayName = savedName.length > 0 ? savedName : t('profileDefaultName');
      const monogram = Array.from(displayName)[0] ?? '·';

      if (!editing) {
        return h('div', { className: 'dshUsage-profile' },
          savedAvatar.length > 0
            ? h('img', { className: 'dshUsage-avatar', src: savedAvatar, alt: '', width: 104, height: 104 })
            : h('div', { className: 'dshUsage-avatar dshUsage-avatarMark', 'aria-hidden': 'true' }, monogram),
          h('div', { className: 'dshUsage-name' }, displayName),
          savedHandle.length > 0 ? h('div', { className: 'dshUsage-handle' }, savedHandle) : null,
          h('button', { type: 'button', className: 'dshUsage-editBtn', onClick: openEditor }, t('editProfile')));
      }

      return h('div', { className: 'dshUsage-profile' },
        h('div', { className: 'dshUsage-form' },
          h('div', { className: 'dshUsage-field' },
            h('label', { className: 'dshUsage-label', htmlFor: 'dshUsage-name' }, t('profileName')),
            h('input', {
              id: 'dshUsage-name',
              className: 'dshUsage-input',
              type: 'text',
              maxLength: 48,
              placeholder: t('profileNamePlaceholder'),
              value: draft.name,
              onChange: (event) => setDraft((previous) => ({ ...previous, name: event.target.value })),
            })),
          h('div', { className: 'dshUsage-field' },
            h('label', { className: 'dshUsage-label', htmlFor: 'dshUsage-handle' }, t('profileHandle')),
            h('input', {
              id: 'dshUsage-handle',
              className: 'dshUsage-input',
              type: 'text',
              maxLength: 48,
              placeholder: t('profileHandlePlaceholder'),
              value: draft.handle,
              onChange: (event) => setDraft((previous) => ({ ...previous, handle: event.target.value })),
            })),
          h('div', { className: 'dshUsage-field' },
            h('div', { className: 'dshUsage-label' }, t('profileAvatar')),
            h('div', { className: 'dshUsage-avatarRow' },
              draft.avatar.length > 0
                ? h('img', { className: 'dshUsage-avatarPreview', src: draft.avatar, alt: '' })
                : h('div', { className: 'dshUsage-avatarPreview dshUsage-avatarMark', 'aria-hidden': 'true' }, monogram),
              h('label', { className: 'dshUsage-btn' },
                t('chooseImage'),
                h('input', { className: 'dshUsage-file', type: 'file', accept: 'image/*', onChange: pickAvatar })),
              h('button', {
                type: 'button',
                className: 'dshUsage-btn',
                onClick: () => setDraft((previous) => ({ ...previous, avatar: '' })),
              }, t('removeImage')))),
          status.error.length > 0 ? h('div', { className: 'dshUsage-formError' }, status.error) : null,
          h('div', { className: 'dshUsage-hint' }, t('profileHint')),
          h('div', { className: 'dshUsage-formActions' },
            h('button', { type: 'button', className: 'dshUsage-btn', onClick: () => setEditing(false) }, t('cancel')),
            h('button', {
              type: 'button',
              className: 'dshUsage-btn',
              'data-kind': 'primary',
              disabled: status.saving,
              onClick: save,
            }, status.saving ? t('saving') : t('save')))));
    }

    /**
     * Five lifetime figures in one strip.
     * @param {{ lifetime: object, stats: object, t: Function }} props - report slices and translator.
     * @returns {React.ReactElement} the strip.
     */
    function StatStrip(props) {
      const lifetime = props.lifetime ?? {};
      const stats = props.stats ?? {};
      const t = props.t;
      const peak = stats.peakDay ?? {};
      const cells = [
        { value: formatTokens(lifetime.total), label: t('statTotal') },
        { value: formatTokens(peak.total), label: t('statPeak') },
        { value: formatDuration(stats.longestTurnMs, t), label: t('statLongestTask') },
        { value: t('daysUnit', { n: stats.longestStreak ?? 0 }), label: t('statLongestStreak') },
        { value: t('daysUnit', { n: stats.currentStreak ?? 0 }), label: t('statCurrentStreak') },
      ];
      return h('div', { className: 'dshUsage-stats' }, cells.map((cell) => h('div', { key: cell.label, className: 'dshUsage-stat' },
        h('div', { className: 'dshUsage-statValue', title: cell.value }, cell.value),
        h('div', { className: 'dshUsage-statLabel' }, cell.label))));
    }

    /**
     * Calendar heatmap of token activity: one fixed-size cell per day, seven
     * rows per week column, month labels underneath the grid.
     * @param {{ activity: object[], today: string, mode: string, selected: number, onSelect: Function, t: Function }} props - report slice and view state.
     * @returns {React.ReactElement} the heatmap.
     */
    function Heatmap(props) {
      const t = props.t;
      const activity = Array.isArray(props.activity) ? props.activity : [];
      const mode = props.mode;
      const today = typeof props.today === 'string' ? props.today : '';
      const selected = props.selected;
      const onSelect = props.onSelect;

      const weeks = [];
      for (let i = 0; i + 7 <= activity.length; i += 7) weeks.push(activity.slice(i, i + 7));
      if (weeks.length === 0) return h('div', { className: 'dshUsage-note' }, t('noActivity'));

      const weekTotals = weeks.map((week) => week.reduce((sum, day) => sum + (Number(day.total) || 0), 0));
      const cumulativeDays = [];
      let running = 0;
      for (const day of activity) {
        running += Number(day.total) || 0;
        cumulativeDays.push(running);
      }
      let todayIndex = -1;
      for (let i = 0; i < activity.length; i += 1) {
        if (activity[i].date === today) {
          todayIndex = i;
          break;
        }
      }
      const lastCounted = todayIndex >= 0 ? todayIndex : activity.length - 1;

      /**
       * Metric value for one cell under the selected mode.
       * @param {number} index - absolute day index.
       * @returns {number} the metric value.
       */
      const valueAt = (index) => {
        if (mode === 'week') return weekTotals[Math.floor(index / 7)] ?? 0;
        if (mode === 'cumulative') return index <= lastCounted ? cumulativeDays[index] : cumulativeDays[lastCounted];
        return Number(activity[index]?.total) || 0;
      };
      let max = 0;
      for (let i = 0; i <= lastCounted; i += 1) max = Math.max(max, valueAt(i));
      const levelOf = (value) => {
        if (value <= 0 || max <= 0) return 0;
        const ratio = value / max;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.5) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
      };

      /**
       * One cell's label for tooltips and the detail line.
       * @param {number} index - absolute day index.
       * @returns {string} the description.
       */
      const describe = (index) => {
        const day = activity[index];
        const future = today !== '' && day.date > today;
        if (future) return `${day.date} · ${t('futureHint')}`;
        if (mode === 'week') {
          const column = weeks[Math.floor(index / 7)];
          const first = column[0].date;
          const last = column[column.length - 1].date;
          return t('cellWeek', { from: first, to: last, tokens: formatTokens(weekTotals[Math.floor(index / 7)] ?? 0) });
        }
        if (mode === 'cumulative') {
          return t('cellCumulative', { date: day.date, tokens: formatTokens(valueAt(index)) });
        }
        const tokens = formatTokens(day.total);
        const requests = Number(day.requests) || 0;
        return `${t('cellDay', { date: day.date, tokens })}${requests > 0 ? ` · ${t('cellRequests', { n: requests })}` : ''}`;
      };

      const cells = weeks.map((week, columnIndex) => h('div', { key: week[0].date, className: 'dshUsage-week' },
        week.map((day, rowIndex) => {
          const index = columnIndex * 7 + rowIndex;
          const future = today !== '' && day.date > today;
          const value = future ? 0 : valueAt(index);
          return h('div', {
            key: day.date,
            className: 'dshUsage-cell',
            role: 'gridcell',
            'data-level': String(levelOf(value)),
            'data-future': String(future),
            'data-selected': String(selected === index),
            title: describe(index),
            'aria-label': describe(index),
            onClick: future ? undefined : () => onSelect(index),
          });
        })));

      const monthRow = h('div', { className: 'dshUsage-months' }, weeks.map((week, index) => {
        const start = week[0].date;
        const previous = index > 0 ? weeks[index - 1][0].date : '';
        const startsMonth = start.slice(0, 7) !== previous.slice(0, 7);
        return h('span', { key: start, className: 'dshUsage-month' }, startsMonth ? monthLabel(start) : '');
      }));

      const detail = selected >= 0 && selected < activity.length ? describe(selected) : t('pickHint');
      const scrollRef = props.scrollRef;

      return h(React.Fragment, null,
        h('div', { className: 'dshUsage-heatScroll', ref: scrollRef },
          h('div', { className: 'dshUsage-heat' },
            h('div', { className: 'dshUsage-weeks', role: 'grid' }, cells),
            monthRow)),
        h('div', { className: 'dshUsage-heatFoot' },
          h('div', { className: 'dshUsage-cellDetail' }, detail),
          h('div', { className: 'dshUsage-legend' },
            h('span', null, t('less')),
            [0, 1, 2, 3, 4].map((level) => h('span', { key: level, className: 'dshUsage-legendCell', 'data-level': String(level) })),
            h('span', null, t('more')))));
    }

    /**
     * One tool chip.
     * @param {{ name: string, calls: number, t: Function }} props - tool row and translator.
     * @returns {React.ReactElement} the chip.
     */
    function ToolChip(props) {
      const initials = String(props.name).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '·';
      const label = `${props.name} · ${props.t('requestsUnit', { n: props.calls })}`;
      return h('div', { className: 'dshUsage-chip', title: label },
        h('div', { className: 'dshUsage-chipMark', 'aria-hidden': 'true' }, initials),
        h('div', { className: 'dshUsage-chipName', title: label }, props.name));
    }

    /**
     * Behaviour insights: effort, skills, tool calls.
     * @param {{ efforts: object[], skills: object, tools: object, t: Function }} props - report slices and translator.
     * @returns {React.ReactElement} the insight rows.
     */
    function Insights(props) {
      const t = props.t;
      const efforts = Array.isArray(props.efforts) ? props.efforts : [];
      const skills = props.skills ?? {};
      const tools = props.tools ?? {};
      const totalEffort = efforts.reduce((sum, row) => sum + (Number(row.requests) || 0), 0);
      const top = efforts[0];
      const effortText = top === undefined || totalEffort === 0
        ? t('notUsed')
        : `${effortLabel(top.id, t)} · ${Math.round((top.requests / totalEffort) * 100)}%`;
      const rows = [
        { label: t('topEffort'), value: effortText },
        { label: t('skillsDiscovered'), value: String(skills.discovered ?? 0) },
        { label: t('skillCalls'), value: String(skills.calls ?? 0) },
        { label: t('toolCalls'), value: String(tools.calls ?? 0) },
      ];
      return h('div', { className: 'dshUsage-insights' }, rows.map((row) => h('div', { key: row.label, className: 'dshUsage-insight' },
        h('span', { className: 'dshUsage-insightLabel' }, row.label),
        h('span', { className: 'dshUsage-insightValue' }, row.value))));
    }

    /**
     * Recent per-model and per-session detail.
     * @param {{ models: object[], sessions: object[], t: Function }} props - report slices and translator.
     * @returns {React.ReactElement} the two columns.
     */
    function Detail(props) {
      const t = props.t;
      const models = Array.isArray(props.models) ? props.models : [];
      const sessions = Array.isArray(props.sessions) ? props.sessions : [];
      const column = (title, rows, emptyText) => h('div', { className: 'dshUsage-col' },
        h('div', { className: 'dshUsage-colTitle' }, title),
        rows.length === 0
          ? h('div', { className: 'dshUsage-note' }, emptyText)
          : rows.map((row) => h('div', { key: row.key, className: 'dshUsage-detail', title: row.title },
            h('span', { className: 'dshUsage-detailName' }, row.name),
            h('span', { className: 'dshUsage-detailValue' }, formatTokens(row.total)))));
      return h('div', { className: 'dshUsage-cols' },
        column(t('byModel'), models.map((model) => ({
          key: `${model.provider}/${model.model}`,
          name: model.model,
          title: `${model.provider} · ${t('requestsUnit', { n: model.requests })}`,
          total: model.total,
        })), t('noModels')),
        column(t('bySession'), sessions.map((session) => ({
          key: session.id,
          name: session.title,
          title: `${session.title} · ${t('requestsUnit', { n: session.requests })}`,
          total: session.total,
        })), t('noSessions')));
    }

    /**
     * Header action: refresh the report without leaving Settings.
     * @param {{ t?: Function, refresh?: Function, useUsageVisible?: Function }} props - translator, bump action and visibility hook.
     * @returns {React.ReactElement | null} the header button.
     */
    function RefreshAction(props) {
      const t = translate(props === null || props === undefined ? undefined : props.t, en);
      const useVisible = props === null || props === undefined ? undefined : props.useUsageVisible;
      const visible = typeof useVisible === 'function' ? useVisible((value) => value) === true : false;
      const refresh = props === null || props === undefined ? undefined : props.refresh;
      if (!visible) return null;
      return h(React.Fragment, null,
        h('style', { key: 'dsh-usage-action-style' }, CSS),
        h('button', {
          type: 'button',
          className: 'dshUsage-actionBtn',
          onClick: typeof refresh === 'function' ? refresh : undefined,
        }, t('refresh')));
    }

    /**
     * The Usage settings page.
     * @param {{ t?: Function, useUsageRefresh?: Function, setVisible?: Function }} props - slot props.
     * @returns {React.ReactElement} the page.
     */
    function UsageSection(props) {
      const t = translate(props === null || props === undefined ? undefined : props.t, en);
      const useRefresh = props === null || props === undefined ? undefined : props.useUsageRefresh;
      const nonce = typeof useRefresh === 'function' ? useRefresh((value) => value) : 0;
      const setVisible = props === null || props === undefined ? undefined : props.setVisible;
      const [metric, setMetric] = useState('day');
      const [selected, setSelected] = useState(-1);
      const [state, setState] = useState({ status: 'loading', data: undefined, error: '' });
      const scrollRef = useRef(null);

      useEffect(() => {
        const element = scrollRef.current;
        if (element !== null && element.scrollWidth > element.clientWidth) element.scrollLeft = element.scrollWidth;
      }, [state.data, metric]);

      useEffect(() => {
        if (typeof setVisible === 'function') setVisible(true);
        return () => {
          if (typeof setVisible === 'function') setVisible(false);
        };
      }, [setVisible]);

      useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        setState((previous) => ({ status: 'loading', data: previous.data, error: '' }));
        let url;
        try {
          url = new URL('api/codex-usage.dashboard', document.baseURI);
        } catch (error) {
          setState({ status: 'error', data: undefined, error: String(error) });
          return () => controller.abort();
        }
        url.searchParams.set('tz', String(new Date().getTimezoneOffset()));
        if ((Number(nonce) || 0) > 0) url.searchParams.set('fresh', '1');
        (async () => {
          try {
            const response = await fetch(url.toString(), {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
              signal: controller.signal,
            });
            if (!response.ok) {
              let detail = '';
              try {
                const body = await response.json();
                detail = typeof body?.error === 'string' ? body.error : '';
              } catch {
                /* a non-JSON failure still reports its status */
              }
              throw new Error(detail || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (!cancelled) setState({ status: 'ready', data, error: '' });
          } catch (error) {
            if (cancelled || error?.name === 'AbortError') return;
            setState((previous) => ({
              status: 'error',
              data: previous.data,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        })();
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [nonce]);

      const data = state.data;
      const ready = data !== undefined && state.status !== 'error';
      const lifetime = ready ? data.lifetime ?? {} : undefined;
      const hasUsage = lifetime !== undefined && (Number(lifetime.requests) || 0) > 0;

      /**
       * Fold a saved profile into the report already on screen, so the header
       * updates without re-reading every session log.
       * @param {object | null} profile - profile the Host stored.
       * @returns {void}
       */
      const onProfileSaved = (profile) => {
        if (profile === null || typeof profile !== 'object') return;
        setState((previous) => (previous.data === undefined
          ? previous
          : { ...previous, data: { ...previous.data, profile } }));
      };

      const body = ready && hasUsage ? h(React.Fragment, null,
        h(StatStrip, { lifetime: data.lifetime, stats: data.stats, t }),
        h('div', { className: 'dshUsage-section' },
          h('div', { className: 'dshUsage-sectionHead' },
            h('div', { className: 'dshUsage-sectionTitle' }, t('activity')),
            h('div', { className: 'dshUsage-seg', role: 'group', 'aria-label': t('activity') },
              [['day', 'metricDay'], ['week', 'metricWeek'], ['cumulative', 'metricCumulative']].map(([value, key]) => h('button', {
                key: value,
                type: 'button',
                className: 'dshUsage-segBtn',
                'data-active': String(metric === value),
                'aria-pressed': metric === value,
                onClick: () => setMetric(value),
              }, t(key))))),
          h(Heatmap, {
            activity: data.activity,
            today: data.today,
            mode: metric,
            selected,
            onSelect: setSelected,
            scrollRef,
            t,
          })),
        h('div', { className: 'dshUsage-section' },
          h('div', { className: 'dshUsage-sectionHead' }, h('div', { className: 'dshUsage-sectionTitle' }, t('tools'))),
          data.tools?.top?.length > 0
            ? h('div', { className: 'dshUsage-chips' }, data.tools.top.map((tool) => h(ToolChip, { key: tool.name, name: tool.name, calls: tool.calls, t })))
            : h('div', { className: 'dshUsage-note' }, t('noTools'))),
        h('div', { className: 'dshUsage-section' },
          h('div', { className: 'dshUsage-sectionHead' }, h('div', { className: 'dshUsage-sectionTitle' }, t('insights'))),
          h(Insights, { efforts: data.efforts, skills: data.skills, tools: data.tools, t })),
        h('div', { className: 'dshUsage-section' },
          h('div', { className: 'dshUsage-sectionHead' }, h('div', { className: 'dshUsage-sectionTitle' }, t('detail', { n: data.detailDays ?? 30 }))),
          h(Detail, { models: data.models, sessions: data.sessions, t }))) : null;

      const loading = state.status === 'loading' ? h('div', { className: 'dshUsage-state' }, t('loading')) : null;
      const failure = state.status === 'error'
        ? h('div', { className: 'dshUsage-state dshUsage-error' }, t('failed', { message: state.error }))
        : null;
      const empty = ready && !hasUsage ? h('div', { className: 'dshUsage-state' }, t('empty')) : null;
      const footer = ready ? h('div', { className: 'dshUsage-note' },
        t('footnote', {
          scanned: data.scan?.scanned ?? 0,
          sessions: data.scan?.sessions ?? 0,
          time: new Date(data.generatedAt ?? Date.now()).toLocaleTimeString(),
        }),
        data.scan?.truncated ? ` · ${t('truncated')}` : '') : null;

      return h(React.Fragment, null,
        h('style', { key: 'dsh-usage-style' }, CSS),
        h('div', { className: 'dshUsage-root' },
          h(ProfileHeader, { profile: data === undefined ? undefined : data.profile, t, onSaved: onProfileSaved }),
          loading, failure, empty, body, footer));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'codex-usage-board: dictionaries');
        const t = ctx.locale.bind(NS);

        /** Refresh signal shared by the header action and the page. */
        const refresh = { value: 0, listeners: new Set() };
        const refreshHook = {
          getSnapshot: () => refresh.value,
          subscribe: (listener) => {
            refresh.listeners.add(listener);
            return () => refresh.listeners.delete(listener);
          },
        };
        const bump = () => {
          refresh.value += 1;
          for (const listener of [...refresh.listeners]) listener();
        };

        /** Whether the usage page is the mounted section, so the action can show itself. */
        const visible = { value: false, listeners: new Set() };
        const visibleHook = {
          getSnapshot: () => visible.value,
          subscribe: (listener) => {
            visible.listeners.add(listener);
            return () => visible.listeners.delete(listener);
          },
        };
        const setVisible = (next) => {
          if (visible.value === next) return;
          visible.value = next;
          for (const listener of [...visible.listeners]) listener();
        };

        ctx.slots.inject('settings.action', () => ctx.slots.register({
          name: 'settings.action',
          id: 'codex-usage-refresh',
          order: 10,
          locale: NS,
          inject: () => ({ hooks: { usageVisible: visibleHook }, refresh: bump }),
        }, RefreshAction));

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'codex-usage',
          order: 25,
          label: () => t('nav'),
          locale: NS,
          inject: () => ({ hooks: { usageRefresh: refreshHook }, setVisible }),
        }, UsageSection));
      },
    };
  },
});
