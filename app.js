/* ============================================================
   分账 App · app.js
   已串接 Google Apps Script Web App API（doGet / doPost）
   支援：多旅程切换、消费自订日期、参与人全选/全不选
   ============================================================ */

/* ------------------------------------------------------------
   0. 全域常数
   ------------------------------------------------------------ */

const PAGE_IDS = ['dashboard', 'expenses', 'summary', 'members', 'settings'];

/**
 * 三套导览（桌面侧栏 #sidebarNav、手机抽屉 #drawerNav、手机底部导览 #mobileTabbar）
 * 共用的唯一资料源——原本三处各自手刻一份几乎一样的 HTML，图示 SVG 被複製了
 * 三次，「结算」「同行」这两个图示还因为各自维护，底部导览列那份漏掉了装饰线条，
 * 长得跟侧栏不一样；手机抽屉那份甚至整个没有图示。见 renderMainNav()
 * @typedef {{page: string, labelKey: string, icon: string, tabbarHidden?: boolean}} NavItem
 * @type {NavItem[]}
 */
const NAV_ITEMS = [
  {
    page: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.7"/></svg>'
  },
  {
    page: 'expenses',
    labelKey: 'nav.expenses',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5H18V20.5L15.5 19L13 20.5L10.5 19L8 20.5L6 19V3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8H15M9 11.5H15M9 15H12.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
  },
  {
    page: 'summary',
    labelKey: 'nav.summary',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5V20.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6 8L12 3.5L18 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 8H8.5L6 14.5C6 14.5 4.8 16 6 16.8C6.9 17.4 8.5 17 8.5 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 8H20.5L18 14.5C18 14.5 16.8 16 18 16.8C18.9 17.4 20.5 17 20.5 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    page: 'members',
    labelKey: 'nav.members',
    icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8.5" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 19C3.5 15.5 6 13.5 9 13.5C12 13.5 14.5 15.5 14.5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.5 6.5C16.9 6.8 18 8 18 9.5C18 11 16.9 12.2 15.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 13.7C18.9 14.2 20.5 15.9 20.5 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  },
  {
    page: 'settings',
    labelKey: 'nav.settings',
    icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M12 3.5V5.5M12 18.5V20.5M20.5 12H18.5M5.5 12H3.5M17.8 6.2L16.4 7.6M7.6 16.4L6.2 17.8M17.8 17.8L16.4 16.4M7.6 7.6L6.2 6.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    // 手机版左上角已经有汉堡选单可以进设置页，底部导览列不需要重複放
    tabbarHidden: true
  }
];


/**
 * 依目前语言取得指定页面的标题与副标题
 * @param {string} pageId 页面代号
 * @return {{title: string, subtitle: string}}
 */
function getPageMeta(pageId) {
  return {
    title: t(`page.${pageId}.title`),
    subtitle: t(`page.${pageId}.subtitle`)
  };
}

/**
 * 依目前语言取得指定页面右上角主要操作按钮的设定
 * @param {string} pageId 页面代号
 * @return {{label: string, modal: string|null}}
 */
function getPageAction(pageId) {
  const map = {
    dashboard: { labelKey: '', modal: null },
    expenses: { labelKey: 'header.addExpense', modal: 'addExpenseModal' },
    summary: { labelKey: '', modal: null },
    members: { labelKey: '', modal: null },
    settings: { labelKey: '', modal: null }
  };
  const entry = map[pageId];
  return { label: entry.labelKey ? t(entry.labelKey) : '', modal: entry.modal };
}

const STORAGE_KEY_THEME = 'splitapp-theme';
const STORAGE_KEY_LANG = 'splitapp-lang';

// 支援的显示语言清单——语言选择器（见「语言选择」章节）依这份清单动态产生选项，
// 未来要加新语言（例如马来文、越南文），只要在这里补一笔、在 STRINGS 里补上对应 key 的翻译，
// 不需要再改选择器的渲染逻辑
const SUPPORTED_LANGUAGES = [
  { code: 'zh', nativeLabel: '中文' },
  { code: 'en', nativeLabel: 'English' }
];

/**
 * 依语言代码查出该语言的自称显示名称（例如 'zh' → '中文'），查不到就直接回传代码本身，
 * 至少不会显示空白
 * @param {string} code
 * @return {string}
 */
function getLanguageNativeLabel(code) {
  const lang = SUPPORTED_LANGUAGES.find((item) => item.code === code);
  return lang ? lang.nativeLabel : code;
}

/**
 * 依 SUPPORTED_LANGUAGES 清单顺序，找出「目前语言的下一个」是哪个语言代码，
 * 超过清单尾端就绕回第一个——导览上的语言切换按钮（一点击就直接换下一个）靠这个决定要换成什么
 * @return {string} 下一个语言代码
 */
function getNextLanguageCode() {
  const currentIndex = SUPPORTED_LANGUAGES.findIndex((lang) => lang.code === currentLang);
  const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
  return SUPPORTED_LANGUAGES[nextIndex].code;
}

const STORAGE_KEY_LAST_SPLIT = 'splitapp-last-split'; // 智能记忆：每位付款人上次选的参与人/分账方式
const STORAGE_KEY_EXPENSE_DRAFT = 'splitapp-expense-draft'; // 新增消费表单草稿

const STORAGE_KEY_CURRENT_TRIP = 'splitapp-current-trip';

// 离线韧性（见「4B. 离线韧性」章节）：
// - STORAGE_KEY_OFFLINE_QUEUE：网路断线时暂存的「新增消费」请求，恢复连线后依序补送
// - STORAGE_KEY_TRIP_CACHE_PREFIX：每趟旅程最近一次成功拉到的 getTripBootstrap 结果，
//   开着 App 却突然断线（或一开始就没有网路）时，先用这份「有点旧但还算数」的资料撑住画面，
//   不要整页空白/报错
const STORAGE_KEY_OFFLINE_QUEUE = 'splitapp-offline-expense-queue';
const STORAGE_KEY_TRIP_CACHE_PREFIX = 'splitapp-trip-cache-';
const STORAGE_KEY_TRIPS_CACHE = 'splitapp-trips-cache';

/**
 * 分类消费的图示与配色（Recent Activity 圆底图示用）
 * 颜色刻意选用低饱和度的柔和色调，跟整体「克制高级感」的配色一致
 */
const CATEGORY_ICON_META = {
  Food: {
    cls: 'cat-food',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 3V10M6 3V7C6 8.5 6.9 9.5 8 9.5M10 3V7C10 8.5 9.1 9.5 8 9.5M8 9.5V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 3C14.5 3 14 5 14 8C14 10 15 11 16 11V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  Transport: {
    cls: 'cat-transport',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 16V11.5L6 7H18L20 11.5V16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 16H20M4 16V18.5M20 16V18.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="7.5" cy="16" r="1.4" fill="currentColor"/><circle cx="16.5" cy="16" r="1.4" fill="currentColor"/></svg>'
  },
  Hotel: {
    cls: 'cat-hotel',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 19V9M3 19H21M21 19V13M3 13H21M3 13V11C3 9.9 3.9 9 5 9H9C10.1 9 11 9.9 11 11V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  Ticket: {
    cls: 'cat-ticket',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8C4 6.9 4.9 6 6 6H18C19.1 6 20 6.9 20 8V9.5C18.9 9.5 18 10.4 18 11.5C18 12.6 18.9 13.5 20 13.5V15C20 16.1 19.1 17 18 17H6C4.9 17 4 16.1 4 15V13.5C5.1 13.5 6 12.6 6 11.5C6 10.4 5.1 9.5 4 9.5V8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 6.5V16.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg>'
  },
  Shopping: {
    cls: 'cat-shopping',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 8H18L19 20H5L6 8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8V6.5C9 4.6 10.3 3 12 3C13.7 3 15 4.6 15 6.5V8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  },
  Others: {
    cls: 'cat-others',
    svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="17" cy="12" r="1.6" fill="currentColor"/></svg>'
  }
};

/**
 * 自定义分类专用的图示预设——刻意跟 CATEGORY_ICON_META（系统内置那 6 个分类）
 * 完全分开一组，不重複使用。原本让使用者从内置分类的图示裡选，
 * 会造成一个自定义分类（例如「潜水装备」）选了「交通」的公车图示，
 * 结果长得跟内置的「交通」分类一模一样（同形状、同颜色），一眼看错行；
 * 这裡改成一组通用、内置分类不会用到的图示，形状不重複，颜色也刻意不沿用
 * CATEGORY_ICON_META 那几个 cat-food／cat-transport 等 class（避免颜色也
 * 撞在一起），5 个颜色轮流分给 10 个图示
 */
const CUSTOM_CATEGORY_ICON_PRESETS = {
  Luggage: {
    cls: 'cat-custom-teal',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 7V5C9 4 9.7 3.5 10.5 3.5H13.5C14.3 3.5 15 4 15 5V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 12H20" stroke="currentColor" stroke-width="1.6"/></svg>'
  },
  Camera: {
    cls: 'cat-custom-green',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5C4 7.4 4.9 6.5 6 6.5H8L9 4.5H15L16 6.5H18C19.1 6.5 20 7.4 20 8.5V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.3" stroke="currentColor" stroke-width="1.6"/></svg>'
  },
  Gift: {
    cls: 'cat-custom-orange',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M4 10H20V7.5C20 6.7 19.3 6 18.5 6H5.5C4.7 6 4 6.7 4 7.5V10Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6V20" stroke="currentColor" stroke-width="1.6"/><path d="M12 6C12 6 9 6 9 3.8C9 2.8 9.8 2 10.7 2C11.9 2 12 4 12 6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 6C12 6 15 6 15 3.8C15 2.8 14.2 2 13.3 2C12.1 2 12 4 12 6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  },
  Medical: {
    cls: 'cat-custom-amber',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M12 8V16M8 12H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  Pet: {
    cls: 'cat-custom-purple',
    svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="15" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="8" r="1.8" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="6" r="1.8" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="8" r="1.8" stroke="currentColor" stroke-width="1.5"/></svg>'
  },
  Music: {
    cls: 'cat-custom-teal',
    svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="17" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="15" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 17V5.5L19.5 3.5V15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  Drink: {
    cls: 'cat-custom-green',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 8H16V16C16 18.2 14.2 20 12 20H10C7.8 20 6 18.2 6 16V8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 10H17.5C18.9 10 20 11.1 20 12.5C20 13.9 18.9 15 17.5 15H16" stroke="currentColor" stroke-width="1.6"/><path d="M9 5C9 4 10 4 10 3M13 5C13 4 14 4 14 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  },
  Beach: {
    cls: 'cat-custom-orange',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3C7 3 3.5 7 3.5 11H20.5C20.5 7 17 3 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 21C12 21 9 21 8 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  },
  Book: {
    cls: 'cat-custom-amber',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11V19H5.5C4.7 19 4 18.3 4 17.5V5.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 5.5C20 4.7 19.3 4 18.5 4H13V19H18.5C19.3 19 20 18.3 20 17.5V5.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  },
  Star: {
    cls: 'cat-custom-purple',
    svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5L14.5 9.2L20.5 9.9L16 14L17.3 20L12 17L6.7 20L8 14L3.5 9.9L9.5 9.2L12 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  }
};


/**
 * 依分类取得图示 meta——系统内置分类直接查表；自定义分类去 appState.categories
 * 找有没有存 icon（新增分类时使用者可能挑了一个既有图示）。
 * 自定义分类选的图示来自 CUSTOM_CATEGORY_ICON_PRESETS 这组独立的预设（不是
 * CATEGORY_ICON_META 那 6 个内置分类图示，见 CUSTOM_CATEGORY_ICON_PRESETS
 * 的说明）——这里两组都查一次，是为了兼容「阶段 9 修正之前」就已经选了内置
 * 分类图示的既有自定义分类，不会因为改版而突然找不到图示；都没有就退回
 * 「分类名首字」的色块兜底，取代最早「找不到就一律用『其他』的三个点图示」
 * 的做法——三个点是「其他」这个特定分类专属的意象，挪去代表「随便一个没设
 * 图示的自定义分类」语意上并不合适
 * @param {string} category 分类原始值
 * @return {{cls: string, svg: string}}
 */
function getCategoryIconMeta(category) {
  if (CATEGORY_ICON_META[category]) {
    return CATEGORY_ICON_META[category];
  }

  const customCategory = (appState.categories || []).find((item) => item.name === category);
  if (customCategory && customCategory.icon) {
    if (CUSTOM_CATEGORY_ICON_PRESETS[customCategory.icon]) {
      return CUSTOM_CATEGORY_ICON_PRESETS[customCategory.icon];
    }
    if (CATEGORY_ICON_META[customCategory.icon]) {
      return CATEGORY_ICON_META[customCategory.icon];
    }
  }

  const initial = (category || '').trim().charAt(0).toUpperCase() || '?';
  return {
    // cls 只是给 CSS 一个挂载点调整字体大小，颜色本身沿用 .activity-icon
    // 的预设色（accent-soft 底、accent 字），刚好就是「色块」效果，不需要
    // 再另外定义一组背景色
    cls: 'cat-custom-fallback',
    svg: `<span class="cat-fallback-letter">${escapeHtml(initial)}</span>`
  };
}

/**
 * 取得目前登入中的全域账号 Session（未过期才算数；真正的防线是后端验证签章跟过期时间，
 * 这里只是让前端能提前判断要不要显示登入闸门，不需要每次都先打一次 API 才知道）
 * @return {{userId: string, username: string, displayName: string, token: string, expiresAt: number}|null}
 */
// Supabase 目前的登入 Session（由 onAuthStateChange 即时更新，见下方 initSupabaseAuthListener）
// 之所以另外存一份到这个变数，是因为很多地方（例如画面渲染）需要「同步」马上拿到目前登入者，
// 而 supabaseClient.auth.getSession() 本身是非同步的 Promise，不方便到处 await
let currentSupabaseSession = null;

/**
 * 监听 Supabase 的登入状态变化：登入、登出、Token 自动刷新、忘记密码连结点进来，
 * 都会经过这里，统一更新 currentSupabaseSession
 * 在 DOMContentLoaded 一开始就要呼叫一次，确保之后 getUserSession() 拿到的都是最新状态
 */
function initSupabaseAuthListener() {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSupabaseSession = session;

    // 使用者从「忘记密码」信件里的连结点进来：Supabase 会自动建立一个临时 Session，
    // 并且触发这个事件——直接带去「设定新密码」这步，不管原本停在登入闸门的哪个分页
    if (event === 'PASSWORD_RECOVERY') {
      showAuthGate();
      showAuthGateResetStep();
    }
  });
}

/**
 * 取得目前登入中的账号 Session（未过期才算数）
 * 栏位维持跟旧版一样的形状（userId / displayName / email / token），
 * 这样呼叫端（画面渲染那些地方）几乎不用跟着改
 * @return {{userId: string, displayName: string, email: string, token: string}|null}
 */
function getUserSession() {
  const session = currentSupabaseSession;
  if (!session || !session.user) {
    return null;
  }
  const user = session.user;
  const metadata = user.user_metadata || {};
  return {
    userId: user.id,
    displayName: metadata.nickname || metadata.first_name || '',
    email: user.email || '',
    token: session.access_token
  };
}

/**
 * 登出
 */
async function clearUserSession() {
  await supabaseClient.auth.signOut();
}

/**
 * 取得目前登入账号，在「目前这趟旅程」里对应的成员姓名——也就是 Hero Card / Balance Matrix
 * 要显示「谁的」净额。伺服器在 getTripBootstrap 时就已经算好（appState.viewerName），
 * 这里沿用旧名称 getViewerName()，是为了让既有的 renderHeroCard / renderBalanceMatrix 等呼叫端不用跟着改
 * @return {string} 成员姓名，找不到（例如资料还没载入）则回传空字串
 */
function getViewerName() {
  return appState.viewerName || '';
}

// 汇总类金额一律以此符号显示（后端不做汇率换算，详见先前说明）
const DEFAULT_CURRENCY_SYMBOL = 'RM';

const TOAST_DURATION_MS = 3600;
const AMOUNT_TOLERANCE = 0.01;


/**
 * 将成员名单依姓名排序（A-Z，中文姓名依拼音排序）
 * 排序结果会套用到所有用到 appState.members 的地方：
 * 成员页、付款人下拉选单、参与人清单、还款下拉选单、每人消费总览、PDF 报告
 * @param {Array<string>} members 原始成员名单
 * @return {Array<string>} 排序后的成员名单（不修改原阵列）
 */
function sortMembersAlphabetically(members) {
  return [...members].sort((a, b) =>
    a.localeCompare(b, ['zh-Hans-u-co-pinyin', 'en'], { sensitivity: 'base', numeric: true })
  );
}

/**
 * 将结算总览的 summary 物件依成员姓名排序（A-Z），balances 与 settlements 皆排序，
 * 确保「每人结算总览」「建议还款」的呈现顺序跟其他地方一致
 * @param {Object} summary 原始 summary 物件 { balances, settlements }
 * @return {Object} 排序后的新 summary 物件
 */
function sortSummaryAlphabetically(summary) {
  const safeSummary = summary || { balances: [], settlements: [] };

  const sortedBalances = [...(safeSummary.balances || [])].sort((a, b) =>
    a.name.localeCompare(b.name, ['zh-Hans-u-co-pinyin', 'en'], { sensitivity: 'base', numeric: true })
  );

  const sortedSettlements = [...(safeSummary.settlements || [])].sort((a, b) =>
    a.from.localeCompare(b.from, ['zh-Hans-u-co-pinyin', 'en'], { sensitivity: 'base', numeric: true }) ||
    a.to.localeCompare(b.to, ['zh-Hans-u-co-pinyin', 'en'], { sensitivity: 'base', numeric: true })
  );

  return { balances: sortedBalances, settlements: sortedSettlements };
}


/* ------------------------------------------------------------
   0B. DivvyDuck 双语文案配置档 (Bilingual Copywriting Config)
   ------------------------------------------------------------
   这是整个品牌文案的「单一真相来源」。往后要新增或调整任何
   面向使用者的文字，都建议先加进这份字典，再用 t('key') 取用，
   而不是把字串直接写死在 HTML 或 JS 字串模板里。
   ------------------------------------------------------------ */

const STRINGS = {
  zh: {
    'brand.name': '搭伙鸭',
    'brand.slogan': '聚会分账，鸭力全无！',
    'nav.dashboard': '概览',
    'nav.expenses': '账目',
    'nav.summary': '结算',
    'nav.members': '成员',
    'nav.settings': '设置',
    // 原本 expensesShort/summaryShort 两个「短标签」是给底部导览用的，但值
    // 其实一直跟完整版一模一样（从没真的缩短过），且 members 从来没补过对应的
    // short key——三处导览统一改成共用同一份 NAV_ITEMS 资料後，直接一律用
    // 完整标签，不再维护这组形同虚设的短版本（见 renderMainNav()）

    // 纯 aria-label 用的无障碍文案（没有对应的可见文字），原本大多是「静态、
    // 跟语言无关」的场景所以没接进 data-i18n-aria-label 机制，最终检查时
    // 一次补齐，确保英文模式下屏幕阅读器念出来的也是英文
    'nav.primaryAriaLabel': '主导航',
    'nav.primaryMobileAriaLabel': '主导航（移动版）',
    'nav.openMenuAriaLabel': '开启导航选单',
    'settings.themeToggleAriaLabel': '切换深色模式',
    'trip.selectAriaLabel': '选择旅程',
    'dashboard.mascotAriaLabel': '搭伙鸭吉祥物，点一下换句话',
    'dashboard.poolCardDotAriaLabel': '搭伙鸭金库',
    'dashboard.netCardDotAriaLabel': '个人净额总览',
    'expense.categoryGroupAriaLabel': '分类',
    'expense.currencyAriaLabel': '币别',
    'expense.removePhotoAriaLabel': '移除照片',
    'expense.receiptPreviewAlt': '收据预览',
    'pool.currencyAriaLabel': '金库货币',

    // 页首标题 / 副标题（每个页面）
    'page.dashboard.title': '概览',
    'page.dashboard.subtitle': '这趟旅程的收支，一眼看完',
    'page.expenses.title': '账目',
    'page.expenses.subtitle': '所有人的每一笔花费',
    'page.summary.title': '结算',
    'page.summary.subtitle': '转账次数最少的还款方案',
    'page.members.title': '成员',
    'page.members.subtitle': '这趟旅程的所有成员',
    'page.settings.title': '设置',
    'page.settings.subtitle': '外观、分类与连线',
    'header.addExpense': '记一笔',
    'header.searchPlaceholder': '搜寻说明、金额、分类、成员、日期…',

    // Dashboard 统计卡
    'stat.totalExpense': '总消费',
    'stat.totalExpenseMeta': '全部纪录累计',
    'stat.pendingSettlement': '待结算',
    'stat.memberCount': '成员',
    'stat.expenseRecords': '消费笔数',
    'allExpenses.subtitle': '共 {count} 笔 · 合计 {total}',
    'settlementModal.empty.title': '没有需要结算的款项',
    'settlementModal.empty.desc': '账目已经平衡。',
    'stat.monthRecords': '本月',
    'dashboard.recentExpenses': '近期账目',
    'dashboard.viewAll': '查看全部',
    'dashboard.categorySummary': '分类消费',
    'dashboard.categoryClickHint': '点击分类查看明细',

    // Dashboard 欢迎词（用登入账号的显示名称打招呼）
    'dashboard.welcomeBack': '{greeting}，{name}',
    'dashboard.greeting.morning': '早安',
    'dashboard.greeting.afternoon': '午安',
    'dashboard.greeting.evening': '晚安',
    'dashboard.greeting.night': '夜深了',

    // Dashboard 沉浸态头部：旅程标题、日期/汇率、头像堆叠
    'dashboard.tripMetaCreated': '建立于 {date} · {currency}',

    // 全域账号登入闸门：进 App 前一定要先登入/注册，看不到任何资料
    'authGate.brandSlogan': '聚会分账，鸭力全无！',
    'authGate.loginTab': '登入',
    'authGate.signupTab': '注册',
    'authGate.passwordLabel': '密码',
    'authGate.passwordPlaceholder': '输入密码',
    'authGate.signupPasswordPlaceholder': '至少 6 个字元，建议混合英数',
    'authGate.firstNameLabel': '姓氏',
    'authGate.firstNamePlaceholder': 'Tan',
    'authGate.lastNameLabel': '名字',
    'authGate.lastNamePlaceholder': 'Wei Ling',
    'authGate.nicknameLabel': 'Nickname',
    'authGate.nicknamePlaceholder': '成员会看到的名字，例如「小伟」',
    'authGate.inviteCodeLabel': '邀请码（选填）',
    'authGate.inviteCodePlaceholder': '有的话填在这里',
    'authGate.inviteCodeHint': '有邀请码会直接加入朋友的旅程；没有的话，注册后可以自己建一个。',
    'authGate.loginSubmit': '登入',
    'authGate.signupSubmit': '注册',
    'authGate.loginFailed': '登入失败',
    'authGate.signupFailed': '注册失败',
    'authGate.signupSuccessTitle': '注册成功',
    'authGate.signupSuccessMsg': '请前往邮箱点击验证连结后再登入',
    'authGate.switchToSignup': '还没有账号？注册',
    'authGate.switchToLogin': '已经有账号？登入',
    'authGate.emailLabel': '邮箱',
    'authGate.emailPlaceholder': 'name@example.com',
    'authGate.forgotPasswordLink': '忘记密码？',
    'authGate.forgotStepDesc': '输入注册时用的邮箱，我们会寄重设密码的连结给你。',
    'authGate.forgotSubmitBtn': '寄送连结',
    'authGate.backToLogin': '返回登入',
    'authGate.resetStepDesc': '设定一个新密码。',
    'authGate.newPasswordLabel': '新密码',
    'authGate.resetSubmitBtn': '设定密码',
    'authGate.claimMemberLabel': '这趟旅程里，你是哪一位？',
    'authGate.claimMemberNoneOption': '都不是，新建一位成员',
    'authGate.claimMemberPlaceholder': '请选择',
    'authGate.claimMemberReviewTitle': '再确认一下',
    'authGate.claimMemberReviewMsg': '这趟旅程有还没连结账号的旧成员，选好「你是哪一位」再送出。',
    'authGate.alreadyMemberNotice': '你已经加入过这趟旅程了。',

    // 邀请码与用户名面板（设置页第一个面板）
    'invite.panelTitle': '邀请码',
    'invite.rowDesc': '分享给朋友，让他们加入这趟旅程',
    'invite.label': '邀请码',
    'invite.copyBtn': '分享',
    'invite.shareMessage': '嘎～我在搭伙鸭上开了一趟旅程「{tripName}」，点这个链接就能加入，一起记账不心累：{link}',
    'invite.copiedTitle': '已复制',
    'invite.copiedMsg': '分享给成员，注册或登入后就能加入。',

    // 新增旅程 Modal 的「加入旅程」分页
    'joinTrip.tab': '加入旅程',
    'createTrip.tab': '新建旅程',
    'joinTrip.inviteCodeLabel': '邀请码',
    'joinTrip.inviteCodePlaceholder': '输入朋友分享的邀请码',
    'joinTrip.submit': '加入旅程',
    'joinTrip.hint': '向已经在旅程里的成员索取邀请码。',
    'joinTrip.failedTitle': '加入失败',

    // 账号（登出按钮实际放在左边导览栏，不在设置页里）
    'account.logoutBtn': '登出',

    // Settings 页「语言」面板（手机上碰不到桌面版侧栏的语言切换，这里补一份）
    'settings.languageRowTitle': '显示语言',
    'settings.tripPanelTitle': '旅程设置',
    'settings.currentTripLabel': '目前旅程',
    'settings.currentTripHint': '以下设定都专属于这趟旅程',
    'languagePicker.title': '选择语言',
    'languagePicker.hint': '选好后介面文字会立刻切换',

    // Settings 页「API 连线设定」面板新增的密码保护（网址预设隐藏，密码正确才会显示出来）

    // Settings 页「账户资料」面板：Email、更改显示名称、更改密码（用户名不能改）
    'account.panelTitle': '账户资料',
    'account.changeBtn': '更改',
    'account.saveBtn': '储存',
    'account.cancelBtn': '取消',
    'account.emailLabel': 'Email',
    'account.emailNotSet': '尚未设定',
    'account.emailHint': '登入用的邮箱，也会用来接收重设密码的连结。',
    'account.emailSavedTitle': 'Email 已更新',
    'account.emailSavedMsg': '请前往新邮箱点击确认连结，完成后邮箱才会真的更新',
    'account.emailSaveFailedTitle': '更新 Email 失败',
    'account.passwordLabel': '密码',
    'account.passwordDots': '••••••••',
    'account.displayNameLabel': 'Nickname',
    'account.displayNamePlaceholder': '成员会看到的名字',
    'account.displayNameHint': '会同步更新到这个账号目前所在的所有旅程，包含既有的。',
    'account.currentPasswordLabel': '目前密码',
    'account.newPasswordLabel': '新密码',
    'account.changePasswordBtn': '更改密码',
    'account.passwordChangeFailedTitle': '更改密码失败',
    'account.passwordFieldsRequired': '请输入目前密码与新密码',
    'account.sessionEmailMissing': '找不到目前登入的账号邮箱',
    'account.currentPasswordIncorrect': '目前密码不正确',
    'account.displayNameSaveFailedTitle': '更新显示名称失败',

    // Hero Card：个人净额
    'hero.receivableLabel': '预计收回',
    'hero.payableLabel': '预计需付',
    'hero.settledLabel': '已结清',
    'hero.frontedLabel': '已付金额',
    'hero.personalLabel': '个人消费',
    'hero.receivedLabel': '已收金额',
    'hero.noViewerTitle': '还没设定你是谁',
    'hero.noViewerDesc': '这个账号还没连结到这趟旅程里的任何一位成员，请联系旅程发起人协助设定。',
    'hero.mascot.ariaLabel': '搭伙鸭吉祥物，点一下换句话',
    'hero.mascot.receivable.1': '别人欠你的，记得提醒一下',
    'hero.mascot.receivable.2': '钱还在路上，别急',
    'hero.mascot.payable.1': '欠的账，迟早要还的',
    'hero.mascot.payable.2': '找个时间还一还，心里舒坦',
    'hero.mascot.settled.1': '一毛不欠，一身轻松',
    'hero.mascot.settled.2': '账清了，继续玩吧',

    // Quick Actions Dock
    'dashboard.qaSettle': '最优结算',
    'dashboard.qaStats': '账单统计',

    // Balance Matrix：谁欠谁
    'dashboard.matrixTitle': '谁欠谁',
    'dashboard.matrixHint': '一眼看懂资金流向',
    'dashboard.matrix.owesYouSub': '需要转给你',
    'dashboard.matrix.youOweSub': '你需要转给对方',
    'dashboard.matrix.otherPairSub': '待结算',
    'dashboard.matrix.remind': '提醒',
    'dashboard.matrix.collapse': '收起',
    'dashboard.matrix.reminderText': '嘎～{name}，鸭鸭掐指一算，你还欠 {amount} 没转喔，别让鸭鸭继续念叨啦 🦆\n点这里看明细、还能自己开个账号盯着：{link}',
    'empty.noExpenses.title': '还没有消费纪录',
    'empty.noExpenses.desc': '记第一笔消费，开始一起记账。',
    'empty.noSettlement.title': '没有待结算款项',
    'empty.noSettlement.desc': '所有人的账都结清了。',
    'empty.noCategory.title': '鸭鸭还没算出花费占比～',
    'empty.noCategory.desc': '记几笔消费，这里就会自动长出分类图表。',

    // 消费纪录页
    'expenses.filterAll': '全部',
    'expenses.loadMore': '载入更多（还有 {count} 笔）',
    'table.date': '日期',
    'table.description': '说明',
    'table.category': '分类',
    'table.payer': '付款人',
    'table.amount': '金额',
    'badge.equal': '平均',
    'badge.custom': '自订',
    'empty.noMatchingExpenses.title': '没有符合条件的消费',
    'empty.noMatchingExpenses.desc': '试试调整筛选条件或搜寻关键字。',

    // 消费记账 Modal
    'expenseModal.titleAdd': '新增消费',
    'expenseModal.titleEdit': '编辑消费',
    'expenseModal.saveAdd': '储存消费',
    'expenseModal.saveEdit': '储存变更',
    'expense.payerLabel': '谁先垫付的？',
    'expense.payerPlaceholder': '选择付款人',
    'expense.amountLabel': '金额',
    'expense.dateLabel': '日期',
    'expense.descriptionLabel': '说明',
    'expense.descriptionPlaceholder': '例如：晚餐、油钱、酒店订金…',
    'expense.splitTypeLabel': '分账方式',
    'expense.splitHint': '预设全员均分，也能切换成自订金额或部分成员分摊。',
    'expense.participantsLabel': '参与人',
    'expense.selectAll': '全选 / 全不选',
    'expense.customSplitHint': '自订总额需等于消费金额',
    'expense.fillRemainingBtn': '均分剩余金额',
    'expense.receiptLabel': '收据照片（选填）',
    'expense.receiptHint': '点一下选择拍照、相簿或档案。',
    'expense.receiptUploadAriaLabel': '上传收据照片，可拍照、选相簿或档案',
    'expense.remarkLabel': '备注（选填）',
    'expense.remarkPlaceholder': '备注内容',
    'common.cancel': '取消',
    'common.close': '关闭',
    'common.back': '返回',
    'common.save': '储存',
    'common.view': '查看',
    'common.showPassword': '按住显示密码',
    'confirm.title': '确定要删除吗？',
    'confirm.confirmDelete': '确认删除',
    'confirm.settleAllTitle': '确认结清',
    'confirm.settleAllLabel': '确认结清',
    'confirm.mergeMemberTitle': '确认合并',
    'confirm.mergeMemberLabel': '确认合并',
    'confirm.leaveTripTitle': '确认退出旅程',
    'confirm.leaveTripLabel': '确认退出',
    'confirm.missingRateTitle': '汇率尚未设定',

    // 成员总览 / 消费明细 Modal
    'memberStats.receivable': '应收',
    'memberStats.payable': '应付',
    'memberStats.settled': '已结清',
    'memberStatus.settled': '已清算 {amount}',
    'memberStatus.pending': '待清算 {amount}',
    'memberDetail.titleSuffix': '的消费明细',
    'memberDetail.summary': '共 {count} 笔 · 已付 {paid} · 应付 {shouldPay}',
    'memberDetail.repaidNote': ' · 已还 {repaid}',
    'memberDetail.total': '消费合计',
    'memberDetail.expenseSectionLabel': '消费明细（{count} 笔）',
    'memberDetail.repaymentSectionLabel': '还款纪录（{count} 笔）',
    'memberDetail.repaymentTotal': '还款合计',
    'memberDetail.personalExpenseSectionLabel': '私人消费（{count} 笔）',
    'memberDetail.personalExpenseHint': '只有你自己看得到，不出现在账目页，也不算进任何人的分账/结算。',
    'memberDetail.personalExpenseTotal': '私人消费合计',
    'memberDetail.empty.title': '还没有相关纪录',
    'memberDetail.empty.desc': '新增消费时把他加进参与人，就会出现在这里。',
    'badge.paid': '付款',
    'badge.repay': '还款',

    // 分类消费明细 Modal
    'categoryModal.subtitle': '共 {count} 笔 · 合计 {total}',
    'categoryModal.empty.title': '这个分类还没有消费',
    'categoryModal.empty.desc': '选择这个分类新增一笔消费看看。',

    // 结算总览页
    'summary.exportPdf': '汇出 PDF',
    'summary.balancePanel': '每人收支',
    'summary.settlementPanel': '最优结算',
    'settlement.bannerHint': '最少转账次数，最简单的归还路径。',
    'settlement.allSettled.title': '太棒了',
    'settlement.allSettled.desc': '所有账目已经结清，大家两不相欠。',
    'settlement.markAsPaid': '一键结清',
    'settlement.goRepay': '去还款',
    'settlement.poolOffsetBadge': '金库抵扣',
    'settlement.settleAllConfirm': '这会把 {count} 笔建议（共 {total}）标记成「已还款」。请先确认转账都已经实际完成——搭伙鸭不会帮你转账，也无法验证钱有没有到账，标记错了要自己回来修改或删除。',
    'settlement.settleAllSuccess': '已全部结清',
    'settlement.settleAllSuccessMsg': '已自动记录 {count} 笔还款。',
    'summary.repaymentPanel': '还款纪录',
    'summary.addRepayment': '+ 记录还款',
    'summary.repaymentHint': '记录谁实际把钱转给谁，余额会自动扣抵',
    'summary.repaymentShowAll': '查看全部',
    'summary.repaymentShowMine': '只看与我相关',
    'summary.repaymentNoneRelated': '没有与你相关的还款纪录',
    'empty.noBalance.title': '鸭鸭还算不出谁欠谁～',
    'empty.noBalance.desc': '记第一笔消费，收支状况马上现形。',
    'empty.noRepayment.title': '还没有还款纪录',
    'empty.noRepayment.desc': '有人实际转账后，点击上方「记录还款」。',

    // 还款 Modal
    'repaymentModal.title': '记录还款',
    // label 精简：多选、各自填金额这件事 UI 本身（checkbox + 金额输入框）已经表达
    // 清楚了，不需要在 label 里重複解释
    'repayment.toLabel': '收款人',
    'repayment.fromLabel': '还款人',
    'repayment.selectMember': '选择成员',
    'repayment.dateLabel': '日期',
    'repayment.remarkPlaceholder': '例如：现金 / 转账',
    'repayment.save': '储存',
    'editRepaymentModal.title': '编辑还款纪录',
    'editRepaymentModal.fromLabel': '还款人',
    'editRepaymentModal.saveBtn': '储存变更',

    // 成员页
    'members.addBtn': '新增成员',
    'members.participatedIn': '参与 {count} 笔消费',
    'empty.noMembers.title': '鸭鸭的旅程还是一个人～',
    'empty.noMembers.desc': '拉朋友进来，开销才有地方分。',
    'members.duplicateBanner.title': '发现还没连结账号的旧成员',
    'members.duplicateBanner.desc': '如果其中一位其实是你，合并后 ta 名下的历史消费会接续到你身上。',
    'members.duplicateBanner.reviewBtn': '查看',
    'mergeMemberModal.title': '合并重复成员',
    'mergeMemberModal.hint': '选到「这是我」的那一位，合并后旧纪录会消失，历史消费与还款都会接续到你身上，此操作无法复原。',
    'mergeMemberModal.confirmBtn': '这是我，合并',
    'mergeMemberModal.empty.title': '没有需要合并的成员',
    'mergeMemberModal.empty.desc': '这趟旅程目前没有还没连结账号的旧成员。',
    'memberModal.title': '邀请成员加入账本',
    'memberModal.nameLabel': '成员姓名',
    'memberModal.namePlaceholder': '例如：Wei',
    'memberModal.save': '新增成员',

    // 旅程
    'tripModal.title': '新增旅程',
    'tripModal.nameLabel': '旅程名称',
    'tripModal.namePlaceholder': '例如：日本雪季之旅',
    'tripModal.currencyLabel': '基准货币',
    'tripModal.currencyHint': '结算金额都以此为准，之后可以到设置页调整',
    'tripModal.hint': '每个旅程都有各自独立的成员与消费纪录。',
    'tripModal.save': '建立旅程',
    'system.noTripMsg': '请先建立一个旅程，才能开始记录消费。',
    'system.loadFailed': '资料载入失败',

    // 更改旅程名称
    'renameTripModal.title': '更改旅程名称',
    'renameTripModal.nameLabel': '旅程名称',
    'renameTripModal.save': '储存',

    // 选择旅程
    'tripPicker.title': '选择旅程',
    'fab.switchTrip': '切换旅程',
    'fab.addExpense': '新增消费',
    'fab.exportReport': '汇出报告',
    'tripPicker.addBtn': '＋ 新增旅程',

    // 设置页
    'settings.preferencePanel': '偏好设置',
    'settings.darkMode': '深色模式',
    'settings.lightMode': '浅色模式',
    'settings.darkModeDesc': '切换浅色或深色主题',
    'settings.financialPanel': '财务设置',
    'currency.baseCurrencyLabel': '基准货币',
    'currency.baseCurrencyHint': '结算总览、建议还款、还款纪录都以这个货币计算',
    'currency.missingWarning': '部分外币尚未设定汇率，目前暂以 1:1 计算，建议尽快补全。',
    'currency.save': '储存',
    'currency.allBaseCurrency': '所有消费都使用基准货币，不需要设定汇率。',

    // 分类管理
    'settings.categoriesPanel': '分类管理',
    'category.manage.desc': '除了预设的分类，你也可以为这趟旅程新增专属的分类。',
    'category.manage.addBtn': '＋ 新增分类',
    'category.manage.renameBtn': '改名',
    'category.manage.hideBtn': '隐藏',
    'category.manage.unhideBtn': '取消隐藏',
    'category.manage.deleteBtn': '删除',
    'category.manage.hiddenBadge': '已隐藏',
    'addCategoryModal.title': '新增分类',
    'addCategoryModal.editTitle': '编辑分类',
    'addCategoryModal.nameLabel': '分类名称',
    'addCategoryModal.nameHint': '两种语言下都会直接显示你输入的名称，不会另外翻译。',
    'addCategoryModal.iconLabel': '图示（可选）',
    'categoryIcon.Luggage': '行李',
    'categoryIcon.Camera': '相机',
    'categoryIcon.Gift': '礼物',
    'categoryIcon.Medical': '医疗',
    'categoryIcon.Pet': '宠物',
    'categoryIcon.Music': '音乐',
    'categoryIcon.Drink': '饮品',
    'categoryIcon.Beach': '海滩',
    'categoryIcon.Book': '书籍',
    'categoryIcon.Star': '星星',
    'addCategoryModal.save': '储存',
    'confirm.deleteCategory': '删除分类「{name}」？若已有消费纪录将无法删除，请改用隐藏。',
    'toast.pleaseEnterCategoryName': '请输入分类名称',
    'toast.categoryNameDuplicate': '这个名称已经在用了，换一个名字试试',
    'toast.categoryAdded': '已新增分类',
    'toast.categoryRenamed': '已更新分类',
    'toast.categoryHidden': '已隐藏该分类',
    'toast.categoryUnhidden': '已取消隐藏',
    'toast.categoryDeleted': '已删除分类',
    'toast.categoryInUseCannotDelete': '这个分类已经有消费纪录在用，无法删除，请改用隐藏。',

    'settings.deleteTrip': '删除目前旅程',
    'settings.leaveTrip': '退出目前旅程',
    'settings.aboutText': 'DivvyDuck 搭伙鸭 · 聚会分账，鸭力全无！',
    'settings.aboutVersion': '版本 1.0.0',

    'settings.expiringTrips.title': '即将清理的旧旅程',
    'settings.expiringTrips.subtitle': '为了避免旧资料无限累积，超过一年没有任何新消费、还款或金库纪录的旅程会被自动清理。你有 {count} 个旅程将在 30 天内被清理，建议先导出备份。',
    'settings.expiringTrips.daysLeft': '还剩 {days} 天',
    'settings.expiringTrips.viewBtn': '前往导出',

    // 分类翻译
    'category.Food': '餐饮',
    'category.Transport': '交通',
    'category.Hotel': '住宿',
    'category.Ticket': '票券',
    'category.Shopping': '购物',
    'category.Others': '其他',

    // 常用 Toast / 确认文字
    'toast.expenseDeleted': '已删除',
    'toast.expenseDeletedMsg': '这笔消费已移除。',
    'toast.memberDeleted': '已删除',
    'toast.memberDeletedMsg': '成员「{name}」已移除。',
    'toast.memberAlreadyExists': '成员已存在：{name}',
    'toast.memberNotFound': '找不到该成员：{name}',
    'toast.memberInUseCannotDelete': '该成员在此旅程已有相关消费纪录，无法删除：{name}',
    'toast.memberMerged': '合并成功',
    'toast.memberMergedMsg': '「{name}」的历史纪录已并入你的账号。',
    'toast.repaymentDeleted': '已删除',
    'toast.repaymentDeletedMsg': '这笔还款已移除。',
    'toast.tripRenamed': '旅程名称已更新',
    'toast.tripRenamedMsg': '旅程已改名为「{name}」。',
    'toast.tripDeleted': '旅程已删除',
    'toast.tripLeft': '已退出旅程',
    'toast.tripLeftMsg': '你已退出「{name}」，先前的消费与其他人的资料仍会保留。',
    'toast.pleaseSelectTrip': '请先选择旅程',
    'toast.pleaseSelectPayer': '请选择付款人',
    'toast.pleaseSelectCategory': '请选择分类',
    'toast.amountMustBePositive': '金额必须大于 0',
    'toast.needAtLeastOneParticipant': '至少需要 1 位参与人',
    'toast.saveFailed': '储存失败',
    'confirm.deleteExpense': '删除「{name}」这笔消费？此操作无法复原。',
    'confirm.deleteMember': '删除成员「{name}」？若已有消费纪录将无法删除。',
    'confirm.mergeMember': '把「{name}」合并进你自己？合并后旧纪录会消失，ta 名下的消费与还款都会变成你的，无法复原。',
    'confirm.deleteTrip': '删除旅程「{name}」？会一并删除所有成员、消费与还款纪录，无法复原。',
    'confirm.leaveTrip': '退出旅程「{name}」？退出后你不会再看到这趟旅程的资料，但先前记的消费、其他人的资料都会保留，之后可以用邀请码加入回来。',
    'confirm.deleteRepayment': '删除「{name}」这笔还款？余额会重新计算。',
    'confirm.missingRateWarning': '{currencies} 尚未设定汇率，结算金额可能不准确。先去设置页补上，还是继续记录还款？',
    'confirm.expenseMissingRateWarning': '{currency} 还没设定汇率，这笔消费会暂时以 1:1 计算（补上正确汇率后会自动更正）。先去设置页补上，还是先这样记录？',
    'confirm.continueAnyway': '仍要继续',

    // 表单草稿
    'draft.restoredToast': '已还原草稿',
    'draft.restoredMessage': '你上次填到一半的消费被自动储存下来了',

    // 其余 Toast / 提示文字
    'toast.loadFailed': '载入失败',
    'toast.switchFailed': '切换失败',
    'toast.pleaseEnterTripName': '请输入旅程名称',
    'toast.createFailed': '新增失败',
    'toast.pleaseSelectTripForExpense': '新增消费前，请先建立或选择旅程。',
    'toast.pleaseSelectTripForMember': '新增成员前，请先建立或选择旅程。',
    'toast.actionFailed': '操作失败',
    'toast.pleaseEnterAmountFirst': '请先填写金额',
    'toast.noEmptyFields': '没有可以填的栏位',
    'toast.noEmptyFieldsMsg': '已勾选的参与人都填好金额了。',
    'toast.noRemainingAmount': '没有剩余金额可以分配',
    'toast.noRemainingAmountMsg': '目前填写的金额（{filled}）已达到或超过总额。',
    'toast.recordNotFound': '找不到纪录',
    'toast.recordNotFoundMsg': '这笔消费可能已被删除，请重新整理。',
    'toast.receiptUploading': '照片上传中',
    'toast.receiptUploadingMsg': '请等收据照片上传完成后再储存。',
    'toast.customSplitMismatch': '自订分账总额不一致',
    'toast.customSplitMismatchMsg': '还差 {remaining} 没分完，要不要让搭伙鸭帮你均分剩余？',
    'toast.customSplitOverMsg': '目前分配的金额比总额多了 {over}，检查一下是不是哪笔打多了？',
    'toast.fileFormatError': '档案格式错误',
    'toast.fileFormatErrorMsg': '请选择照片格式的档案。',
    'toast.photoUploaded': '照片已上传',
    'toast.photoUploadedMsg': '收据照片已储存。',
    'toast.uploadFailed': '上传失败',
    'toast.pleaseEnterMemberName': '请输入成员姓名',
    'toast.pleaseSelectTripForRepayment': '记录还款前，请先建立或选择旅程。',
    'toast.pleaseSelectRecipient': '请选择收款人',
    'toast.pleaseCheckOneRepayer': '请至少勾选一位还款人',
    'toast.repayerSameAsRecipient': '还款人与收款人不能相同',
    'toast.repayerSameAsRecipientMsg': '请取消勾选「{name}」，或改选其他收款人。',
    'toast.repayerAmountRequired': '每位还款人都要填写大于 0 的金额',
    'toast.resetLinkSent': '重设连结已寄出',
    'toast.resetLinkSentMsg': '如果这个用户名有设定 Email，很快会收到重设密码信。',
    'toast.resetLinkFailed': '操作失败',
    'toast.passwordResetDone': '密码已重设',
    'toast.passwordResetDoneMsg': '请用新密码登入。',
    'toast.exchangeRateFormatError': '汇率格式错误',
    'toast.exchangeRateFormatErrorMsg': '汇率必须是大于 0 的数字。',
    'toast.noTripSelected': '尚未选择旅程',
    'toast.tripDeletedMsg': '旅程「{name}」与其所有资料已移除。',
    'toast.noDataToExport': '尚无资料可汇出',
    'toast.noDataToExportMsg': '请先新增至少一笔消费。',

    // 最后一批补充：系统内部提示、下拉选单、组合文字
    'system.unknownError': '鸭鸭也不知道发生什么事了：重新整理页面，通常就会好~',
    'toast.refreshFailed': '鸭鸭没跟上，刷新卡住了',

    // 离线韧性：断线提示、待同步状态
    'offline.banner': '目前离线中，新增的消费会先存在这台装置上',
    'offline.bannerSyncing': '网络已恢复，鸭鸭正在同步 {count} 笔离线纪录…',
    'offline.pendingBadge': '待同步',
    'offline.expenseQueuedTitle': '已离线暂存',
    'offline.expenseQueuedMsg': '这笔消费先存在装置上，网络恢复后鸭鸭会自动帮你同步。',
    'offline.syncSuccessTitle': '离线纪录已同步',
    'offline.syncSuccessMsg': '{count} 笔离线新增的消费已同步到伺服器。',
    'offline.syncFailedTitle': '部分离线纪录同步失败',
    'offline.syncFailedMsg': '还有 {count} 笔尚未同步，下次连线时会继续重试。',
    'offline.staleDataBanner': '鸭鸭暂时飞不出网络：现在看到的是上次连线的资料（{time}）',
    'trip.noTripOption': '尚无旅程',
    'members.noMembersYet': '尚无成员，请先到「成员」页新增。',
    'expense.customSplitSummary': '已分配 {currency} {allocated} ／ 总额 {currency} {total}',
    'expense.processingPhoto': '处理照片中…',
    'expense.uploadingPhoto': '上传收据中…',
    'expense.photoReadError': '无法读取这张照片，请换一张试试。',
    'expense.fileReadError': '无法读取这个档案。',
    'repayment.checkedTotal': '已勾选 {count} 人，合计 {total}',
    'expense.noDescription': '（无说明）',
    'aria.edit': '编辑',
    'aria.delete': '删除',
    'aria.deleteMember': '删除成员',
    'repayment.paidTo': '还款给 {name}',
    'repayment.recordSuffix': '还款纪录',
    'expense.paidByDate': '{payer} 付款 · {date}',
    'expenseDetailModal.title': '消费明细',
    'expenseDetailModal.splitBreakdown': '分摊明细',
    'expenseDetailModal.payerTag': '付款人',
    'expenseDetailModal.receiptLabel': '收据照片',
    'expenseDetailModal.viewReceiptAriaLabel': '查看收据照片',
    'repayment.currencyUnitHint': '金额单位：{currency}（旅程基准货币）',
    'trip.noTripSelected': '（尚未选择旅程）',
    'toast.closeAriaLabel': '关闭通知',
    'common.processing': '处理中…',

    // PDF 报告
    'report.untitledTrip': '未命名旅程',
    'report.printQualityHintTitle': '汇出前的提醒',
    'report.printQualityHintMsg': '记得在打印视窗勾选「背景图形」，卡片底色才印得出来，不然会变成纯白底喔。',
    'report.generatedAt': '生成时间',
    'report.reportId': '报告编号',
    'report.memberLabel': '成员',
    'report.executiveSummary': '总览摘要',
    'report.personalBalanceSummary': '个人结算摘要',
    'personalReport.allSettled': '已全部结清，无需转账',
    'personalReport.expenseSection': '消费明细',
    'personalReport.personalExpenseSection': '私人消费',
    'personalReport.personalExpenseDisclaimer': '以下为私人消费，与本报告的群组结算无关，不计入应收/应付金额。',
    'personalReport.includePersonalCheckbox': '包含我的私人消费（作为独立章节附在最后，不参与结算）',
    'personalReport.summaryPaid': '已付金额',
    'personalReport.summaryOwnExpense': '个人消费',
    'personalReport.summaryReceived': '已收金额',
    'personalReport.netReceivable': '净结算金额：该收回 {amount}',
    'personalReport.netPayable': '净结算金额：需支付 {amount}',
    'personalReport.netSettled': '净结算金额：已结清',
    'personalReport.owesYouTable': '建议收款对象',
    'personalReport.youOweTable': '建议付款对象',
    'personalReport.counterparty': '对象',
    'personalReport.outflowSection': '支付明细',
    'personalReport.incomeSection': '收款明细',
    'personalReport.typeColumn': '类型',
    'personalReport.typeExpense': '消费',
    'personalReport.typePoolTopup': '金库预付',
    'personalReport.typeRepaymentOut': '还款',
    'personalReport.typeRepaymentIn': '收款',
    'personalReport.typePoolRefund': '金库退款',
    'personalReport.typePoolExpenseRefund': '消费退款',
    'personalReport.paidToItem': '还给 {name}',
    'personalReport.receivedFromItem': '收到 {name} 的还款',
    'personalReport.noOutflow': '目前没有支出纪录',
    'personalReport.noIncome': '目前没有收款纪录',
    'personalReport.poolTopupItem': '充值到搭伙鸭金库',
    'personalReport.poolIconLabel': '金库支出（全员均摊）',
    'personalReport.poolIconLegend': '代表金库支出，由全员均摊计入',

    'pool.detail.title': '搭伙鸭金库明细',
    'pool.detail.emptyTitle': '还没有搭伙鸭金库',
    'pool.detail.emptyDesc': '这趟旅程还没有开始使用搭伙鸭金库。',
    'report.settlementDisclaimer': '以下为最少交易笔数的还款建议，独立于消费总额计算，请勿与消费金额相加。',
    'report.splitRatio': '分账比例',
    'report.settlementFlow': '还款流向',
    'report.originalCurrency': '原始币值',
    'report.exchangeRatesUsed': '本次计算采用汇率',
    'report.rateNotSetFootnote': '部分货币尚未设定汇率，已暂以 1:1 估算，实际金额请以正式汇率为准。',
    'report.titleSuffix': ' · 消费报告',
    'report.totalAmount': '总消费金额',
    'report.expenseCount': '消费笔数',
    'report.memberCount': '成员人数',
    'report.expenseDetailList': '消费明细清单',
    'report.balanceOverview': '每人结算总览',
    'report.suggestedSettlements': '建议还款',
    'report.memberSectionTitle': '成员消费明细 · {name}',
    'report.noExpenseData': '尚无消费纪录',
    'report.noCategoryData': '尚无分类资料',
    'report.noBalanceData': '尚无结算资料',
    'report.allSettled': '没有需要结算的款项，账目已经平衡',
    'report.total': '合计（共 {count} 笔）',
    'report.settleCurrency': '结算货币',
    'table.currency': '货币',
    'table.count': '笔数',
    'table.item': '项目',
    'table.balance': '余额',
    'loading.fetchingRates': '自动抓取汇率中…',

    // 拆账模式（均分/精确金额/百分比/份额）
    'split.equal': '均分',
    'split.exact': '精确金额',
    'split.percentage': '百分比',
    'split.shares': '份额',
    'split.shareUnit': '份',
    'split.percentageHint': '每人的百分比总和需为 100%',
    'split.sharesHint': '依份数比例分配，例如小孩算 1 份、大人算 2 份',
    'split.percentageSummary': '已分配 {allocated}% ／ 100%',
    'split.sharesSummary': '共 {total} 份 ・ 1 份 = {perShare}',
    'split.percentageMismatch': '百分比总和不为 100%',
    'split.percentageMismatchMsg': '目前总和为 {allocated}%，请调整到刚好 100%。',
    'split.sharesInvalid': '份额格式错误',
    'split.sharesInvalidMsg': '每位参与人的份额都必须大于 0。',

    // Wise 即时汇率
    'currency.wiseHint': '汇率来自 Wise 中端市场汇率，仅供参考，储存前请自行确认。',
    'currency.fetchAllRates': '抓取全部即时汇率',
    'currency.fetchRateAria': '抓取即时汇率',
    'toast.rateAutoFetched': '已自动补上汇率',
    'toast.rateAutoFetchedMsg': '1 {currency} = {rate} {base}（来源：Wise），已存进这趟旅程，不准确可到设置页调整。',
    'toast.rateFetchFailed': '抓取失败',
    'toast.rateMissingParams': '缺少必要参数: source / target',
    'toast.rateConnectionFailed': '无法连线至汇率服务，请改用手动输入汇率。',
    'toast.rateBadResponse': '汇率服务回应异常（状态码 {status}），请改用手动输入汇率。',
    'toast.rateUnsupportedPair': '无法取得 {source} → {target} 的汇率（可能是这个货币代码不受支援），请改用手动输入汇率。',
    'toast.allRatesFetched': '已自动补上即时汇率',
    'toast.allRatesFetchedMsg': '成功抓取并存好 {count} 笔汇率，不准确可再手动调整。',
    'toast.noCurrenciesToFetch': '没有需要抓取的货币',
    'toast.noCurrenciesToFetchMsg': '目前所有消费都使用基准货币。',

    /* ---------------------------------------------------------
       搭伙金库 (Divvy Pool)
       --------------------------------------------------------- */
    'pool.status.collecting': '充值中',
    'pool.status.sufficient': '资金充足',
    'pool.status.low': '余额告警',
    'pool.status.settled': '已结程退余',

    'pool.card.balanceLabel': '各货币余额',
    'pool.card.ofTotal': '／ 共 {total}',
    'pool.card.topupCountSummary': '已登记 {count} 笔打款',
    'pool.card.detailBtn': '查看明细',
    'pool.card.settleBtn': '结程退余',

    'pool.form.enableLabel': '开启搭伙鸭金库',
    'pool.form.enableBtnShort': '开启',
    'pool.form.enableHint': '开启后，大家先把钱交给鸭鸭金库统一保管，旅程中花费直接扣，不用一笔笔转账、不用互相记账，轻松很多！',
    'pool.form.perPersonLabel': '人均预付款',

    'pool.error.invalidAmount': '请输入有效的金额',


    'pool.alert.lowBalanceTitle': '金库余额偏低',
    'pool.alert.lowBalanceMessage': '{currency} 余额偏低，建议尽快补充值',

    'pool.settle.confirmMessage': '结程后金库将不能再扣款，确定要按目前余额平分退款给每位成员吗？',
    'pool.settle.confirmTitle': '确认结程',
    'pool.settle.confirmLabel': '确认结程',
    'pool.poster.title': '搭伙鸭金库结算',
    'pool.poster.refundLine': '{name} 退 {refund}',
    'pool.poster.subtitle': '结程后的每人退款明细',
    'pool.poster.offsetLabel': '可与旅程内部欠款互相抵扣，不用真的转账',
    'pool.poster.cashRefundLabel': '外币现金，需要实际退还',
    'pool.poster.noRefundTitle': '这次没有余额可退',
    'pool.poster.noRefundDesc': '金库刚好用完，大家都不用退钱也不用补钱。',

    'pool.report.sectionTitle': '搭伙鸭金库',
    'pool.report.topupTitle': '充值明细',
    'pool.report.transactionsTitle': '支出明细',
    'pool.report.refundTitle': '退余明细',
    'pool.report.perPerson': '人均金额',
    'pool.report.memberCount': '人数',
    'pool.report.noTopups': '这趟旅程还没有登记过打款。',
    'pool.report.noTransactions': '这趟旅程的金库还没有任何支出。',
    'pool.report.type': '类型',
    'pool.report.typeDeduct': '金库支出',
    'pool.report.typeReimburse': '代垫归还',
    'pool.report.typeRefund': '结程退余',
    'pool.report.totalRefund': '退款总额',
    'pool.report.perPersonRefund': '每人应退',
    'pool.report.treatment': '处理方式',
    'pool.report.cashRefundNote': '现金退还',
    'pool.report.expenseRefundNote': '消费退款',
    'pool.report.membersListNote': '适用成员：{members}',
    'pool.report.poolSplitBadge': '金库',

    'pool.mascot.ariaLabel': '搭伙鸭金库吉祥物，点一下换句话',
    'pool.mascot.collecting.1': '钱袋还在收集中，慢慢来～',
    'pool.mascot.collecting.2': '再等等就到齐了',
    'pool.mascot.sufficient.1': '粮草充足，尽管花！',
    'pool.mascot.sufficient.2': '金库鼓鼓的，安心出发',
    'pool.mascot.low.1': '钱包有点扁了，该补货啦',
    'pool.mascot.low.2': '余额告急，记得补充值',
    'pool.mascot.settled.1': '这趟结清啦，钱都算好了',
    'pool.mascot.settled.2': '退款信封已经准备好囉',

    'pool.settings.enableTitle': '搭伙鸭金库',
    'pool.settings.statusTitle': '搭伙鸭金库状态',
    'pool.settings.readOnlyTitle': '金库已开启',
    'pool.settings.readOnlyDesc': '金库由发起人统一管钱，充值、退款都他处理，你只要在下面看看余额剩多少就好，很省心～',
    'pool.settings.topupFormTitle': '充值',
    'pool.settings.topupFormDesc': '填这次的人均金额，系统会自动乘上目前 {count} 位成员算出总额',
    'pool.settings.noMembers': '这趟旅程还没有成员，先加成员再充值',
    'pool.error.initFailed': '充值失败',
    'pool.topup.failedTitle': '充值失败',

    'expense.sourceLabel': '资金来源',
    'expense.sourceNormal': '正常记账',
    'expense.sourcePersonal': '私人消费',
    'expense.sourceDeduct': '金库支出',
    'expense.sourceNormalHint': '照一般方式记账，跟成员依分账方式结算。',
    'expense.sourcePersonalHint': '只有你自己看得到，不出现在账目页，也不参与任何分账/结算。',
    'expense.sourceDeductHint': '这笔钱直接从搭伙鸭金库扣，不会再跟任何人拆账。',

    'pool.expense.deductFailed': '金库支出失败',
    'pool.expense.editBlockedSettledTitle': '无法编辑',
    'pool.expense.editBlockedSettledMsg': '这笔消费所在的那一轮金库已经结算退余，金额没有对象可以多退少补了，只能删除（删除会照现在的成员人数打散退款）。',
    'pool.expense.editFailed': '编辑金库消费失败',
    'pool.expense.deleteFailed': '删除金库消费失败',
    'pool.expense.insufficientBalanceTitle': '金库余额不足',
    'pool.expense.insufficientBalanceMsg': '改成这个金额需要 {amount}，先去金库充值再回来编辑。',
    'pool.expense.deleteRefundedMsg': '这笔消费已删除，金额已经退回金库余额。',
    'pool.expense.deleteSettledRefundTitle': '已按人数打散退款',

    'pool.form.currencyHint': '之后还可以用别种货币再充值，例如在机场先收马币、到当地再收人民币。',
    'pool.settings.topupCountSummary': '已登记 {count} 笔打款',
    'pool.settings.topupBtn': '充值',
    'pool.settings.recordsTitle': '充值记录',
    'pool.settings.editTopupEmptyTitle': '还没有登记纪录',
    'pool.settings.editTopupEmptyDesc': '先充值一笔，之后才能在这里更改。',
    'pool.settings.editTopupMemberCountNote': '总额会用这笔登记当时的人数（{count} 人）重新计算，不受目前成员异动影响。',
    'pool.settings.editTopupFailed': '更改失败',
    'pool.expense.payerDisplayName': '搭伙鸭金库',
    'pool.settings.topupPreview': '{count} 人份 × {perPerson} = {total}'
  },
  en: {
    'brand.name': 'DivvyDuck',
    'brand.slogan': 'Split the bill, lose the stress.',
    'nav.dashboard': 'Overview',
    'nav.expenses': 'Expenses',
    'nav.summary': 'Settle Up',
    'nav.members': 'Members',
    'nav.settings': 'Settings',

    'nav.primaryAriaLabel': 'Primary navigation',
    'nav.primaryMobileAriaLabel': 'Primary navigation (mobile)',
    'nav.openMenuAriaLabel': 'Open navigation menu',
    'settings.themeToggleAriaLabel': 'Toggle dark mode',
    'trip.selectAriaLabel': 'Select trip',
    'dashboard.mascotAriaLabel': 'DivvyDuck mascot, tap for a new line',
    'dashboard.poolCardDotAriaLabel': 'Shared pool',
    'dashboard.netCardDotAriaLabel': 'Personal net balance overview',
    'expense.categoryGroupAriaLabel': 'Category',
    'expense.currencyAriaLabel': 'Currency',
    'expense.removePhotoAriaLabel': 'Remove photo',
    'expense.receiptPreviewAlt': 'Receipt preview',
    'pool.currencyAriaLabel': 'Pool currency',

    'page.dashboard.title': 'Overview',
    'page.dashboard.subtitle': 'Your trip, at a glance',
    'page.expenses.title': 'Expenses',
    'page.expenses.subtitle': 'Every expense, from everyone',
    'page.summary.title': 'Settle Up',
    'page.summary.subtitle': 'The payout plan with the fewest transfers',
    'page.members.title': 'Members',
    'page.members.subtitle': 'Everyone on this trip',
    'page.settings.title': 'Settings',
    'page.settings.subtitle': 'Appearance, categories, connection',
    'header.addExpense': 'Add Expense',
    'header.searchPlaceholder': 'Search description, amount, category, member, date…',

    'stat.totalExpense': 'Total Spent',
    'stat.totalExpenseMeta': 'Every record combined',
    'stat.pendingSettlement': 'Pending Settlement',
    'stat.memberCount': 'Members',
    'stat.expenseRecords': 'Expenses',
    'allExpenses.subtitle': '{count} item(s) · Total {total}',
    'settlementModal.empty.title': 'Nothing to settle',
    'settlementModal.empty.desc': 'Everyone is squared up.',
    'stat.monthRecords': 'This Month',
    'dashboard.recentExpenses': 'Recent Activity',
    'dashboard.viewAll': 'View all',
    'dashboard.categorySummary': 'By Category',
    'dashboard.categoryClickHint': 'Tap a category for details',

    'dashboard.welcomeBack': '{greeting}, {name}',
    'dashboard.greeting.morning': 'Good morning',
    'dashboard.greeting.afternoon': 'Good afternoon',
    'dashboard.greeting.evening': 'Good evening',
    'dashboard.greeting.night': 'Good night',

    'dashboard.tripMetaCreated': 'Created {date} · {currency}',

    'authGate.brandSlogan': 'Split the bill, lose the stress.',
    'authGate.loginTab': 'Log In',
    'authGate.signupTab': 'Sign Up',
    'authGate.passwordLabel': 'Password',
    'authGate.passwordPlaceholder': 'Enter your password',
    'authGate.signupPasswordPlaceholder': 'At least 6 characters, letters and numbers',
    'authGate.firstNameLabel': 'Last Name',
    'authGate.firstNamePlaceholder': 'Tan',
    'authGate.lastNameLabel': 'First Name',
    'authGate.lastNamePlaceholder': 'Wei Ling',
    'authGate.nicknameLabel': 'Nickname',
    'authGate.nicknamePlaceholder': 'What your trip mates will see, e.g. "Alex"',
    'authGate.inviteCodeLabel': 'Invite code (optional)',
    'authGate.inviteCodePlaceholder': "Have a code? Enter it here",
    'authGate.inviteCodeHint': "With a code, you'll join that trip right away. Without one, you can create your own after signing up.",
    'authGate.loginSubmit': 'Log In',
    'authGate.signupSubmit': 'Sign Up',
    'authGate.loginFailed': 'Login failed',
    'authGate.signupFailed': 'Sign up failed',
    'authGate.signupSuccessTitle': 'Account created',
    'authGate.signupSuccessMsg': 'Check your inbox and click the verification link before logging in.',
    'authGate.switchToSignup': "New here? Sign up",
    'authGate.switchToLogin': 'Already have an account? Log in',
    'authGate.emailLabel': 'Email',
    'authGate.emailPlaceholder': 'name@example.com',
    'authGate.forgotPasswordLink': 'Forgot password?',
    'authGate.forgotStepDesc': "Enter the email you signed up with — we'll send a reset link.",
    'authGate.forgotSubmitBtn': 'Send Reset Link',
    'authGate.backToLogin': 'Back to log in',
    'authGate.resetStepDesc': 'Set a new password.',
    'authGate.newPasswordLabel': 'New password',
    'authGate.resetSubmitBtn': 'Set New Password',
    'authGate.claimMemberLabel': 'Which one are you, on this trip?',
    'authGate.claimMemberNoneOption': "None of these — create a new member",
    'authGate.claimMemberPlaceholder': 'Select one',
    'authGate.claimMemberReviewTitle': 'One more thing',
    'authGate.claimMemberReviewMsg': "This trip has an existing member without an account — pick which one is you, then submit again.",
    'authGate.alreadyMemberNotice': "You've already joined this trip.",

    'invite.panelTitle': 'Invite Code',
    'invite.rowDesc': 'Share this so friends can join the trip',
    'invite.label': 'Invite code',
    'invite.copyBtn': 'Share',
    'invite.shareMessage': 'Hey! I started a trip called "{tripName}" on DivvyDuck \u{1F986} \u2014 tap this link to join, splitting bills just got way easier: {link}',
    'invite.copiedTitle': 'Copied',
    'invite.copiedMsg': 'Share this with your Members — they can join after signing up or logging in.',

    'joinTrip.tab': 'Join a Trip',
    'createTrip.tab': 'New Trip',
    'joinTrip.inviteCodeLabel': 'Invite code',
    'joinTrip.inviteCodePlaceholder': "Enter the code your friend shared",
    'joinTrip.submit': 'Join Trip',
    'joinTrip.hint': 'Ask someone already on the trip for the code.',
    'joinTrip.failedTitle': 'Join failed',

    'account.logoutBtn': 'Log out',

    'settings.languageRowTitle': 'Display language',
    'settings.tripPanelTitle': 'Trip',
    'settings.currentTripLabel': 'Current Trip',
    'settings.currentTripHint': 'The settings below are specific to this trip',
    'languagePicker.title': 'Choose language',
    'languagePicker.hint': "Switches instantly once you pick one",


    'account.panelTitle': 'Account',
    'account.changeBtn': 'Edit',
    'account.saveBtn': 'Save',
    'account.cancelBtn': 'Cancel',
    'account.emailLabel': 'Email',
    'account.emailNotSet': 'Not set',
    'account.emailHint': "The email you log in with — also used for password resets.",
    'account.emailSavedTitle': 'Email updated',
    'account.emailSavedMsg': 'Check your new inbox and click the confirmation link \u2014 the email won\u2019t actually change until you do.',
    'account.emailSaveFailedTitle': 'Could not update email',
    'account.passwordLabel': 'Password',
    'account.passwordDots': '••••••••',
    'account.displayNameLabel': 'Nickname',
    'account.displayNamePlaceholder': 'What your trip mates will see',
    'account.displayNameHint': "Updates your name across all trips you're currently in, including existing ones.",
    'account.currentPasswordLabel': 'Current password',
    'account.newPasswordLabel': 'New password',
    'account.changePasswordBtn': 'Change Password',
    'account.passwordChangeFailedTitle': 'Could not change password',
    'account.passwordFieldsRequired': 'Enter your current and new password',
    'account.sessionEmailMissing': "Couldn't find your logged-in account email",
    'account.currentPasswordIncorrect': 'Current password is incorrect',
    'account.displayNameSaveFailedTitle': 'Could not update display name',

    'hero.receivableLabel': 'Expected back',
    'hero.payableLabel': 'You owe',
    'hero.settledLabel': 'All settled',
    'hero.frontedLabel': 'Amount Paid',
    'hero.personalLabel': 'Personal Spend',
    'hero.receivedLabel': 'Amount Received',
    'hero.noViewerTitle': "We don't know who you are yet",
    'hero.noViewerDesc': "This account isn't linked to a member on this trip yet — ask the trip owner for help.",
    'hero.mascot.ariaLabel': 'Divvy Duck mascot, tap for another tip',
    'hero.mascot.receivable.1': "Someone owes you \u2014 don't be shy to remind them",
    'hero.mascot.receivable.2': "The money's on its way, hang tight",
    'hero.mascot.payable.1': "That debt won't pay itself",
    'hero.mascot.payable.2': 'Settle up when you get a chance \u2014 it feels good',
    'hero.mascot.settled.1': "Not a cent owed, feeling light",
    'hero.mascot.settled.2': "All clear \u2014 back to the fun part",

    'dashboard.qaSettle': 'Settle Up',
    'dashboard.qaStats': 'Bill Stats',

    'dashboard.matrixTitle': 'Who Owes Who',
    'dashboard.matrixHint': 'The money flow, at a glance',
    'dashboard.matrix.owesYouSub': 'owes you',
    'dashboard.matrix.youOweSub': 'you owe them',
    'dashboard.matrix.otherPairSub': 'pending settlement',
    'dashboard.matrix.remind': 'Remind',
    'dashboard.matrix.collapse': 'Collapse',
    'dashboard.matrix.reminderText': 'Hey {name}, DivvyDuck here \u{1F986} \u2014 you still have {amount} outstanding from our trip, whenever you get a chance!\nCheck the details (and set up your own account) here: {link}',
    'empty.noExpenses.title': 'No expenses yet',
    'empty.noExpenses.desc': 'Add your first expense to start tracking.',
    'empty.noSettlement.title': 'Nothing to settle',
    'empty.noSettlement.desc': 'Everyone is squared up.',
    'empty.noCategory.title': "DivvyDuck hasn't crunched the numbers yet",
    'empty.noCategory.desc': "Add some expenses and your breakdown will show up here.",

    'expenses.filterAll': 'All',
    'expenses.loadMore': 'Load more ({count} left)',
    'table.date': 'Date',
    'table.description': 'Description',
    'table.category': 'Category',
    'table.payer': 'Payer',
    'table.amount': 'Amount',
    'badge.equal': 'Equal',
    'badge.custom': 'Custom',
    'empty.noMatchingExpenses.title': 'No matching expenses',
    'empty.noMatchingExpenses.desc': 'Try adjusting your filters or search.',

    'expenseModal.titleAdd': 'Add Expense',
    'expenseModal.titleEdit': 'Edit Expense',
    'expenseModal.saveAdd': 'Save Expense',
    'expenseModal.saveEdit': 'Save Changes',
    'expense.payerLabel': 'Who paid?',
    'expense.payerPlaceholder': 'Select payer',
    'expense.amountLabel': 'Amount',
    'expense.dateLabel': 'Date',
    'expense.descriptionLabel': 'Description',
    'expense.descriptionPlaceholder': 'e.g. dinner, gas, hotel deposit…',
    'expense.splitTypeLabel': 'Split Type',
    'expense.splitHint': 'Defaults to equal split — switch to custom amounts or specific members anytime.',
    'expense.participantsLabel': 'Participants',
    'expense.selectAll': 'Select all / none',
    'expense.customSplitHint': 'Custom amounts must add up to the total',
    'expense.fillRemainingBtn': 'Split the rest evenly',
    'expense.receiptLabel': 'Receipt Photo (optional)',
    'expense.receiptUploadAriaLabel': 'Upload receipt photo — take a photo, choose from library, or pick a file',
    'expense.receiptHint': 'Tap to choose camera, library, or file.',
    'expense.remarkLabel': 'Remark (optional)',
    'expense.remarkPlaceholder': 'Add a note',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.save': 'Save',
    'common.view': 'View',
    'common.showPassword': 'Hold to show password',
    'confirm.title': 'Are you sure?',
    'confirm.confirmDelete': 'Confirm Delete',
    'confirm.settleAllTitle': 'Confirm Settlement',
    'confirm.settleAllLabel': 'Confirm Settlement',
    'confirm.mergeMemberTitle': 'Confirm Merge',
    'confirm.mergeMemberLabel': 'Confirm Merge',
    'confirm.leaveTripTitle': 'Leave This Trip?',
    'confirm.leaveTripLabel': 'Confirm Leave',
    'confirm.missingRateTitle': 'Exchange Rate Missing',

    'memberStats.receivable': 'Owed to them',
    'memberStats.payable': 'They owe',
    'memberStats.settled': 'Settled',
    'memberStatus.settled': 'Settled {amount}',
    'memberStatus.pending': 'Pending {amount}',
    'memberDetail.titleSuffix': "'s Expenses",
    'memberDetail.summary': '{count} record(s) · Paid {paid} · Should pay {shouldPay}',
    'memberDetail.repaidNote': ' · Repaid {repaid}',
    'memberDetail.total': 'Expense Total',
    'memberDetail.expenseSectionLabel': 'Expenses ({count})',
    'memberDetail.repaymentSectionLabel': 'Repayments ({count})',
    'memberDetail.repaymentTotal': 'Repayment Total',
    'memberDetail.personalExpenseSectionLabel': 'Private Expenses ({count})',
    'memberDetail.personalExpenseHint': "Only you can see this. It won't appear on the Expenses page or count toward anyone's split/settlement.",
    'memberDetail.personalExpenseTotal': 'Private Expense Total',
    'memberDetail.empty.title': 'No records yet',
    'memberDetail.empty.desc': 'Add them to an expense to see it here.',
    'badge.paid': 'Paid',
    'badge.repay': 'Repaid',

    'categoryModal.subtitle': '{count} item(s) · Total {total}',
    'categoryModal.empty.title': 'No expenses in this category yet',
    'categoryModal.empty.desc': 'Add one to see it here.',

    'summary.exportPdf': 'Export PDF',
    'summary.balancePanel': 'Balances',
    'summary.settlementPanel': 'Optimal Settlement',
    'settlement.bannerHint': 'The fewest transfers, the simplest path back to even.',
    'settlement.settleAllConfirm': "This marks all {count} suggested transfer(s) — {total} total — as repaid. Confirm these transfers actually happened first: DivvyDuck can't move money or verify it arrived. Mark something wrong and you'll need to edit or delete it individually afterward.",
    'settlement.settleAllSuccess': 'All settled up',
    'settlement.settleAllSuccessMsg': '{count} repayment(s) recorded automatically.',
    'settlement.allSettled.title': 'All settled',
    'settlement.allSettled.desc': 'Everyone is settled up.',
    'settlement.markAsPaid': 'Settle All',
    'settlement.goRepay': 'Settle up',
    'settlement.poolOffsetBadge': 'Pool offset',
    'summary.repaymentPanel': 'Repayment History',
    'summary.addRepayment': '+ Record Repayment',
    'summary.repaymentHint': "Log who's actually paid whom back — balances update automatically",
    'summary.repaymentShowAll': 'View All',
    'summary.repaymentShowMine': 'Only Mine',
    'summary.repaymentNoneRelated': "No repayments involving you yet",
    'empty.noBalance.title': "DivvyDuck can't tell who owes who yet",
    'empty.noBalance.desc': "Add some expenses and balances will show up here.",
    'empty.noRepayment.title': 'No repayments yet',
    'empty.noRepayment.desc': 'Once someone pays back, log it above.',

    'repaymentModal.title': 'Record Repayment',
    // Shortened labels: the UI itself (checkbox + amount input) already makes clear
    // that this supports multi-select with per-person amounts, no need to spell it out
    'repayment.toLabel': 'To',
    'repayment.fromLabel': 'From',
    'repayment.selectMember': 'Select member',
    'repayment.dateLabel': 'Date',
    'repayment.remarkPlaceholder': 'e.g. cash / bank transfer',
    'repayment.save': 'Save',
    'editRepaymentModal.title': 'Edit Repayment',
    'editRepaymentModal.fromLabel': 'From',
    'editRepaymentModal.saveBtn': 'Save Changes',

    'members.addBtn': 'Add Member',
    'members.participatedIn': '{count} expense(s)',
    'empty.noMembers.title': "DivvyDuck's trip is a party of one",
    'empty.noMembers.desc': 'Add your Members to start tracking expenses.',
    'members.duplicateBanner.title': 'Unlinked legacy members found',
    'members.duplicateBanner.desc': "If one of these is actually you, merging carries their past expenses over to your account.",
    'members.duplicateBanner.reviewBtn': 'Review',
    'mergeMemberModal.title': 'Merge Duplicate Member',
    'mergeMemberModal.hint': "Pick the one that's you. Merging removes this legacy entry and carries its expenses and repayments to your account — this can't be undone.",
    'mergeMemberModal.confirmBtn': "That's me",
    'mergeMemberModal.empty.title': 'Nothing to merge',
    'mergeMemberModal.empty.desc': 'No unlinked legacy members on this trip right now.',
    'memberModal.title': 'Invite Someone to the Trip',
    'memberModal.nameLabel': 'Member Name',
    'memberModal.namePlaceholder': 'e.g. Alex',
    'memberModal.save': 'Add Member',

    'tripModal.title': 'New Trip',
    'tripModal.nameLabel': 'Trip Name',
    'tripModal.namePlaceholder': 'e.g. Japan Ski Trip',
    'tripModal.currencyLabel': 'Base Currency',
    'tripModal.currencyHint': 'All settlement totals use this — change it later in Settings',
    'tripModal.hint': 'Each trip has its own members and expenses.',
    'tripModal.save': 'Create Trip',
    'system.noTripMsg': 'Create a trip first to start tracking expenses.',
    'system.loadFailed': 'Failed to load',

    // Rename trip
    'renameTripModal.title': 'Rename Trip',
    'renameTripModal.nameLabel': 'Trip Name',
    'renameTripModal.save': 'Save',

    // Trip picker
    'tripPicker.title': 'Select Trip',
    'fab.switchTrip': 'Switch Trip',
    'fab.addExpense': 'Add Expense',
    'fab.exportReport': 'Export Report',
    'tripPicker.addBtn': '+ New Trip',

    'settings.preferencePanel': 'Preferences',
    'settings.darkMode': 'Dark Mode',
    'settings.lightMode': 'Light Mode',
    'settings.darkModeDesc': 'Switch between light and dark themes',
    'settings.financialPanel': 'Financial',
    'currency.baseCurrencyLabel': 'Base Currency',
    'currency.baseCurrencyHint': 'Settlement, transfers, and repayment history all use this currency',
    'currency.missingWarning': 'Some exchange rates are missing and default to 1:1. Complete them for accuracy.',
    'currency.save': 'Save',
    'currency.allBaseCurrency': 'All expenses use the base currency — no exchange rate needed.',

    // Category management
    'settings.categoriesPanel': 'Categories',
    'category.manage.desc': 'Besides the built-in categories, you can add your own for this trip.',
    'category.manage.addBtn': '+ Add Category',
    'category.manage.renameBtn': 'Rename',
    'category.manage.hideBtn': 'Hide',
    'category.manage.unhideBtn': 'Unhide',
    'category.manage.deleteBtn': 'Delete',
    'category.manage.hiddenBadge': 'Hidden',
    'addCategoryModal.title': 'Add Category',
    'addCategoryModal.editTitle': 'Edit Category',
    'addCategoryModal.nameLabel': 'Category Name',
    'addCategoryModal.nameHint': 'Shown as-is in both languages — it will not be translated.',
    'addCategoryModal.iconLabel': 'Icon (optional)',
    'categoryIcon.Luggage': 'Luggage',
    'categoryIcon.Camera': 'Camera',
    'categoryIcon.Gift': 'Gift',
    'categoryIcon.Medical': 'Medical',
    'categoryIcon.Pet': 'Pet',
    'categoryIcon.Music': 'Music',
    'categoryIcon.Drink': 'Drink',
    'categoryIcon.Beach': 'Beach',
    'categoryIcon.Book': 'Book',
    'categoryIcon.Star': 'Star',
    'addCategoryModal.save': 'Save',
    'confirm.deleteCategory': 'Delete category "{name}"? Blocked if it already has expenses — hide it instead.',
    'toast.pleaseEnterCategoryName': 'Enter a category name',
    'toast.categoryNameDuplicate': 'That name is already in use — try a different one',
    'toast.categoryAdded': 'Category added',
    'toast.categoryRenamed': 'Category updated',
    'toast.categoryHidden': 'Category hidden',
    'toast.categoryUnhidden': 'Category unhidden',
    'toast.categoryDeleted': 'Category deleted',
    'toast.categoryInUseCannotDelete': 'This category already has expenses on it and cannot be deleted — hide it instead.',

    'settings.deleteTrip': 'Delete This Trip',
    'settings.leaveTrip': 'Leave This Trip',
    'settings.aboutText': 'DivvyDuck · Split the bill, lose the stress.',
    'settings.aboutVersion': 'Version 1.0.0',

    'settings.expiringTrips.title': 'Trips Nearing Cleanup',
    'settings.expiringTrips.subtitle': 'To keep old data from piling up forever, trips with no new expenses, repayments, or pool activity for over a year get cleaned up automatically. {count} of your trips will be cleaned up within 30 days — export a backup first if you want to keep them.',
    'settings.expiringTrips.daysLeft': '{days} days left',
    'settings.expiringTrips.viewBtn': 'Export',

    'category.Food': 'Food',
    'category.Transport': 'Transport',
    'category.Hotel': 'Hotel',
    'category.Ticket': 'Ticket',
    'category.Shopping': 'Shopping',
    'category.Others': 'Others',

    'toast.expenseDeleted': 'Deleted',
    'toast.expenseDeletedMsg': 'This expense has been removed.',
    'toast.memberDeleted': 'Deleted',
    'toast.memberDeletedMsg': '"{name}" has been removed.',
    'toast.memberAlreadyExists': 'Member already exists: {name}',
    'toast.memberNotFound': "Couldn't find that member: {name}",
    'toast.memberInUseCannotDelete': "This member already has expenses on this trip and can't be deleted: {name}",
    'toast.memberMerged': 'Merged',
    'toast.memberMergedMsg': "\"{name}\"'s history now belongs to your account.",
    'toast.repaymentDeleted': 'Deleted',
    'toast.repaymentDeletedMsg': 'This repayment has been removed.',
    'toast.tripRenamed': 'Trip renamed',
    'toast.tripRenamedMsg': 'Trip renamed to "{name}".',
    'toast.tripDeleted': 'Trip deleted',
    'toast.tripLeft': 'Left the trip',
    'toast.tripLeftMsg': 'You\'ve left "{name}". Your past expenses and everyone else\'s data are still there.',
    'toast.pleaseSelectTrip': 'Select a trip first',
    'toast.pleaseSelectPayer': 'Select a payer',
    'toast.pleaseSelectCategory': 'Select a category',
    'toast.amountMustBePositive': 'Amount must be greater than 0',
    'toast.needAtLeastOneParticipant': 'At least 1 participant is required',
    'toast.saveFailed': 'Save failed',
    'confirm.deleteExpense': 'Delete "{name}"? This cannot be undone.',
    'confirm.deleteMember': 'Delete member "{name}"? Blocked if they already have expenses on this trip.',
    'confirm.mergeMember': 'Merge "{name}" into yourself? This legacy entry disappears and its expenses and repayments become yours. Can\'t be undone.',
    'confirm.deleteTrip': 'Delete trip "{name}"? This also deletes all its members, expenses, and repayments — and cannot be undone.',
    'confirm.leaveTrip': 'Leave trip "{name}"? You\'ll no longer see its data, but your past expenses and everyone else\'s stay intact — rejoin later with the invite code.',
    'confirm.deleteRepayment': 'Delete this repayment ("{name}")? Balances will be recalculated.',
    'confirm.missingRateWarning': '{currencies} still need an exchange rate — totals may be off. Set it up in Settings, or continue anyway?',
    'confirm.expenseMissingRateWarning': "{currency} doesn't have an exchange rate yet, so this converts at 1:1 for now — it'll auto-correct once you set the real rate. Set it up first, or record it as-is?",
    'confirm.continueAnyway': 'Continue Anyway',

    'draft.restoredToast': 'Draft restored',
    'draft.restoredMessage': 'We brought back the expense you were filling in',

    'toast.loadFailed': 'Failed to load',
    'toast.switchFailed': 'Switch failed',
    'toast.pleaseEnterTripName': 'Enter a trip name',
    'toast.createFailed': 'Failed to create',
    'toast.pleaseSelectTripForExpense': 'Create or select a trip before adding an expense.',
    'toast.pleaseSelectTripForMember': 'Create or select a trip before adding a member.',
    'toast.actionFailed': 'Action failed',
    'toast.pleaseEnterAmountFirst': 'Enter the amount first',
    'toast.noEmptyFields': 'Nothing left to fill',
    'toast.noEmptyFieldsMsg': 'All checked participants already have an amount.',
    'toast.noRemainingAmount': 'No remaining amount to distribute',
    'toast.noRemainingAmountMsg': 'The amount entered ({filled}) already reaches or exceeds the total.',
    'toast.recordNotFound': 'Record not found',
    'toast.recordNotFoundMsg': 'This expense may have been deleted — refresh and try again.',
    'toast.receiptUploading': 'Uploading photo',
    'toast.receiptUploadingMsg': 'Wait for the receipt to finish uploading before saving.',
    'toast.customSplitMismatch': "Custom split doesn't add up",
    'toast.customSplitMismatchMsg': "Still {remaining} left to allocate — want DivvyDuck to fill in the rest evenly?",
    'toast.customSplitOverMsg': "You've allocated {over} more than the total — worth checking one of the amounts?",
    'toast.fileFormatError': 'Unsupported file type',
    'toast.fileFormatErrorMsg': 'Choose an image file.',
    'toast.photoUploaded': 'Photo uploaded',
    'toast.photoUploadedMsg': 'The receipt has been saved.',
    'toast.uploadFailed': 'Upload failed',
    'toast.pleaseEnterMemberName': "Enter the member's name",
    'toast.pleaseSelectTripForRepayment': 'Create or select a trip before recording a repayment.',
    'toast.pleaseSelectRecipient': 'Select a recipient',
    'toast.pleaseCheckOneRepayer': 'Check at least one repayer',
    'toast.repayerSameAsRecipient': 'Repayer and recipient cannot be the same',
    'toast.repayerSameAsRecipientMsg': 'Uncheck "{name}", or choose a different recipient.',
    'toast.repayerAmountRequired': 'Every checked repayer needs an amount greater than 0',
    'toast.resetLinkSent': 'Reset link sent',
    'toast.resetLinkSentMsg': "If that username has an email on file, a reset link is on its way.",
    'toast.resetLinkFailed': 'Something went wrong',
    'toast.passwordResetDone': 'Password reset',
    'toast.passwordResetDoneMsg': 'Log in with your new password.',
    'toast.exchangeRateFormatError': 'Invalid exchange rate',
    'toast.exchangeRateFormatErrorMsg': 'Exchange rates must be numbers greater than 0.',
    'toast.noTripSelected': 'No trip selected',
    'toast.tripDeletedMsg': 'Trip "{name}" and all its data have been removed.',
    'toast.noDataToExport': 'Nothing to export yet',
    'toast.noDataToExportMsg': 'Add at least one expense first.',

    'system.unknownError': "Even DivvyDuck isn't sure what happened — refreshing the page usually fixes it.",
    'toast.refreshFailed': 'DivvyDuck got stuck refreshing',

    'offline.banner': "You're offline — new expenses save on this device for now",
    'offline.bannerSyncing': 'Back online — DivvyDuck is syncing {count} record(s)…',
    'offline.pendingBadge': 'Pending sync',
    'offline.expenseQueuedTitle': 'Saved offline',
    'offline.expenseQueuedMsg': "Stored on this device — DivvyDuck will sync it automatically once you're back online.",
    'offline.syncSuccessTitle': 'Synced',
    'offline.syncSuccessMsg': '{count} offline expense(s) synced successfully.',
    'offline.syncFailedTitle': 'Some records failed to sync',
    'offline.syncFailedMsg': "{count} still pending — we'll retry next time you're online.",
    'offline.staleDataBanner': "DivvyDuck's offline for now — showing data from your last connection ({time})",
    'trip.noTripOption': 'No trips',
    'members.noMembersYet': 'No members yet — add some on the Members page.',
    'expense.customSplitSummary': 'Allocated {currency} {allocated} / Total {currency} {total}',
    'expense.processingPhoto': 'Processing photo…',
    'expense.uploadingPhoto': 'Uploading receipt…',
    'expense.photoReadError': "Couldn't read that photo — try another.",
    'expense.fileReadError': "Couldn't read that file.",
    'repayment.checkedTotal': '{count} checked, total {total}',
    'expense.noDescription': '(no description)',
    'aria.edit': 'Edit',
    'aria.delete': 'Delete',
    'aria.deleteMember': 'Delete member',
    'repayment.paidTo': 'Paid to {name}',
    'repayment.recordSuffix': 'Repayment',
    'expense.paidByDate': 'Paid by {payer} · {date}',
    'expenseDetailModal.title': 'Expense Details',
    'expenseDetailModal.splitBreakdown': 'Split Breakdown',
    'expenseDetailModal.payerTag': 'Paid this',
    'expenseDetailModal.receiptLabel': 'Receipt Photo',
    'expenseDetailModal.viewReceiptAriaLabel': 'View receipt photo',
    'repayment.currencyUnitHint': 'Currency: {currency} (trip base currency)',
    'trip.noTripSelected': '(no trip selected)',
    'toast.closeAriaLabel': 'Dismiss notification',
    'common.processing': 'Processing…',

    'report.untitledTrip': 'Untitled Trip',
    'report.printQualityHintTitle': 'Before you export',
    'report.printQualityHintMsg': 'In the print dialog, turn on "Background graphics" — otherwise card colors print as plain white.',
    'report.generatedAt': 'Generated',
    'report.reportId': 'Report ID',
    'report.memberLabel': 'Members',
    'report.executiveSummary': 'Executive Summary',
    'report.personalBalanceSummary': 'Personal Balance Summary',
    'personalReport.allSettled': 'All settled — nothing to transfer',
    'personalReport.expenseSection': 'Expense Detail',
    'personalReport.personalExpenseSection': 'Private Expenses',
    'personalReport.personalExpenseDisclaimer': 'The following are private expenses, unrelated to this report\'s group settlement, and are not counted toward any amount owed/receivable.',
    'personalReport.includePersonalCheckbox': 'Include my private expenses (appended as a separate section, excluded from settlement)',
    'personalReport.summaryPaid': 'Amount Paid',
    'personalReport.summaryOwnExpense': 'Personal Spend',
    'personalReport.summaryReceived': 'Amount Received',
    'personalReport.netReceivable': 'Net Balance: You are owed {amount}',
    'personalReport.netPayable': 'Net Balance: You owe {amount}',
    'personalReport.netSettled': 'Net Balance: Fully Settled',
    'personalReport.owesYouTable': 'Suggested Collections',
    'personalReport.youOweTable': 'Suggested Payments',
    'personalReport.counterparty': 'Person',
    'personalReport.outflowSection': 'Payment Detail',
    'personalReport.incomeSection': 'Income Detail',
    'personalReport.typeColumn': 'Type',
    'personalReport.typeExpense': 'Expense',
    'personalReport.typePoolTopup': 'Pool top-up',
    'personalReport.typeRepaymentOut': 'Repayment',
    'personalReport.typeRepaymentIn': 'Received',
    'personalReport.typePoolRefund': 'Pool refund',
    'personalReport.typePoolExpenseRefund': 'Expense refund',
    'personalReport.paidToItem': 'Paid to {name}',
    'personalReport.receivedFromItem': 'Received from {name}',
    'personalReport.noOutflow': 'No outflow recorded yet',
    'personalReport.noIncome': 'No income recorded yet',
    'personalReport.poolTopupItem': 'Top-up to Divvy Duck Pool',
    'personalReport.poolIconLabel': 'Pool expense (split evenly)',
    'personalReport.poolIconLegend': 'marks a pool expense, split evenly across all members',

    'pool.detail.title': 'Divvy Duck Pool Details',
    'pool.detail.emptyTitle': 'No Divvy Duck Pool yet',
    'pool.detail.emptyDesc': "This trip hasn't started using the Divvy Duck Pool.",
    'report.settlementDisclaimer': 'Optimized settlement plan — calculated independently of expense totals; don\'t add it to them.',
    'report.splitRatio': 'Split Ratios',
    'report.settlementFlow': 'Settlement Flow',
    'report.originalCurrency': 'Original Currency',
    'report.exchangeRatesUsed': 'Exchange Rates Used',
    'report.rateNotSetFootnote': 'Some currencies have no exchange rate set and are temporarily estimated at 1:1 — verify against the official rate.',
    'report.titleSuffix': ' · Expense Report',
    'report.totalAmount': 'Total Expenses',
    'report.expenseCount': 'Expense Count',
    'report.memberCount': 'Members',
    'report.expenseDetailList': 'Expense Breakdown',
    'report.balanceOverview': 'Member Balances',
    'report.suggestedSettlements': 'Suggested Settlements',
    'report.memberSectionTitle': 'Expense Details · {name}',
    'report.noExpenseData': 'No expenses recorded',
    'report.noCategoryData': 'No category data',
    'report.noBalanceData': 'No balance data',
    'report.allSettled': 'Nothing left to settle — everyone is squared up',
    'report.total': 'Total ({count} item(s))',
    'report.settleCurrency': 'Settlement Currency',
    'table.currency': 'Currency',
    'table.count': 'Count',
    'table.item': 'Item',
    'table.balance': 'Balance',
    'loading.fetchingRates': 'Fetching exchange rates…',

    'split.equal': 'Equal',
    'split.exact': 'Exact Amount',
    'split.percentage': 'Percentage',
    'split.shares': 'Shares',
    'split.shareUnit': 'sh',
    'split.percentageHint': "Everyone's percentage must add up to 100%",
    'split.sharesHint': 'Split proportionally by shares — e.g. kids count as 1 share, adults as 2',
    'split.percentageSummary': 'Allocated {allocated}% / 100%',
    'split.sharesSummary': '{total} share(s) total ・ 1 share = {perShare}',
    'split.percentageMismatch': "Percentages don't add up to 100%",
    'split.percentageMismatchMsg': 'Currently {allocated}% — adjust to exactly 100%.',
    'split.sharesInvalid': 'Invalid shares',
    'split.sharesInvalidMsg': "Every participant's share must be greater than 0.",

    'currency.wiseHint': "Rates come from Wise's mid-market rate, for reference only — confirm before saving.",
    'currency.fetchAllRates': 'Fetch All Live Rates',
    'currency.fetchRateAria': 'Fetch live rate',
    'toast.rateAutoFetched': 'Rate filled in',
    'toast.rateAutoFetchedMsg': '1 {currency} = {rate} {base} (via Wise), saved for this trip. Adjust in Settings if it looks off.',
    'toast.rateFetchFailed': 'Fetch failed',
    'toast.rateMissingParams': 'Missing required parameters: source / target',
    'toast.rateConnectionFailed': "Couldn't connect to the exchange rate service. Please enter the rate manually.",
    'toast.rateBadResponse': 'Exchange rate service returned an error (status {status}). Please enter the rate manually.',
    'toast.rateUnsupportedPair': "Couldn't get the {source} → {target} rate (this currency may not be supported). Please enter the rate manually.",
    'toast.allRatesFetched': 'Live rates filled in',
    'toast.allRatesFetchedMsg': 'Fetched and saved {count} rate(s). Adjust manually if any look off.',
    'toast.noCurrenciesToFetch': 'Nothing to fetch',
    'toast.noCurrenciesToFetchMsg': 'All expenses currently use the base currency.',

    /* ---------------------------------------------------------
       Divvy Pool
       --------------------------------------------------------- */
    'pool.status.collecting': 'Collecting',
    'pool.status.sufficient': 'Well Funded',
    'pool.status.low': 'Low Balance',
    'pool.status.settled': 'Settled',

    'pool.card.balanceLabel': 'Balance by currency',
    'pool.card.ofTotal': 'of {total}',
    'pool.card.topupCountSummary': '{count} payment(s) logged',
    'pool.card.detailBtn': 'View Details',
    'pool.card.settleBtn': 'Settle & Refund',

    'pool.form.enableLabel': 'Enable Divvy Duck Pool',
    'pool.form.enableBtnShort': 'Enable',
    'pool.form.enableHint': 'Logged payments go into a shared pool; trip expenses can be paid straight from it',
    'pool.form.perPersonLabel': 'Amount per person',

    'pool.error.invalidAmount': 'Please enter a valid amount',


    'pool.alert.lowBalanceTitle': 'Pool balance is low',
    'pool.alert.lowBalanceMessage': '{currency} balance is running low — log another payment soon',

    'pool.settle.confirmMessage': 'Once settled, the pool can\u2019t take more deductions. Split the remaining balance equally among everyone?',
    'pool.settle.confirmTitle': 'Confirm Settlement',
    'pool.settle.confirmLabel': 'Confirm Settlement',
    'pool.poster.title': 'Divvy Duck Pool Settlement',
    'pool.poster.refundLine': '{name} refund {refund}',
    'pool.poster.subtitle': 'Per-person refund breakdown after settling',
    'pool.poster.offsetLabel': 'Can offset internal trip balances — no need to actually transfer',
    'pool.poster.cashRefundLabel': 'Foreign currency cash — needs an actual refund',
    'pool.poster.noRefundTitle': 'Nothing left to refund',
    'pool.poster.noRefundDesc': 'The pool ran exactly to zero — no one owes or is owed anything.',

    'pool.report.sectionTitle': 'Divvy Duck Pool',
    'pool.report.topupTitle': 'Top-up Details',
    'pool.report.transactionsTitle': 'Spending Details',
    'pool.report.refundTitle': 'Refund Details',
    'pool.report.perPerson': 'Per person',
    'pool.report.memberCount': 'Members',
    'pool.report.noTopups': 'No payments have been logged for this trip.',
    'pool.report.noTransactions': "This trip's pool hasn't spent anything yet.",
    'pool.report.type': 'Type',
    'pool.report.typeDeduct': 'Pool expense',
    'pool.report.typeReimburse': 'Advance refund',
    'pool.report.typeRefund': 'Settlement refund',
    'pool.report.totalRefund': 'Total refund',
    'pool.report.perPersonRefund': 'Per-person refund',
    'pool.report.treatment': 'Treatment',
    'pool.report.cashRefundNote': 'Cash refund',
    'pool.report.expenseRefundNote': 'Expense refund',
    'pool.report.membersListNote': 'Applies to: {members}',
    'pool.report.poolSplitBadge': 'Pool',

    'pool.mascot.ariaLabel': 'Divvy Duck pool mascot, tap for another tip',
    'pool.mascot.collecting.1': 'Still gathering the funds, no rush~',
    'pool.mascot.collecting.2': 'Just waiting on a bit more',
    'pool.mascot.sufficient.1': 'Fully stocked, spend away!',
    'pool.mascot.sufficient.2': 'The pool\u2019s looking healthy',
    'pool.mascot.low.1': 'Wallet\u2019s getting thin, time to refill',
    'pool.mascot.low.2': 'Balance is tight — log another payment',
    'pool.mascot.settled.1': 'All settled, math\u2019s done',
    'pool.mascot.settled.2': 'Refund envelopes are ready',

    'pool.settings.enableTitle': 'Divvy Duck Pool',
    'pool.settings.statusTitle': 'Divvy Duck Pool Status',
    'pool.settings.readOnlyTitle': 'Pool is enabled',
    'pool.settings.readOnlyDesc': "Top-ups and settlements are handled by whoever set up the pool, or the trip owner. You can see the current balance below.",
    'pool.settings.topupFormTitle': 'Top up',
    'pool.settings.topupFormDesc': 'Enter this round\u2019s per-person amount — it\u2019ll be multiplied by the current {count} member(s) automatically',
    'pool.settings.noMembers': 'No members on this trip yet — add members first',
    'pool.error.initFailed': 'Failed to log payment',
    'pool.topup.failedTitle': 'Failed to log payment',

    'expense.sourceLabel': 'Funding source',
    'expense.sourceNormal': 'Normal expense',
    'expense.sourcePersonal': 'Private expense',
    'expense.sourceDeduct': 'Pool expense',
    'expense.sourceNormalHint': 'Recorded as usual and split with the group.',
    'expense.sourcePersonalHint': "Only you can see this. It won't appear on the Expenses page or count toward any split/settlement.",
    'expense.sourceDeductHint': 'Paid straight from the Divvy Duck Pool — no split needed.',

    'pool.expense.deductFailed': 'Pool expense failed',
    'pool.expense.editBlockedSettledTitle': "Can't edit this",
    'pool.expense.editBlockedSettledMsg': "This expense's pool round has already been settled and refunded, so there's no balance left to adjust against. You can only delete it (deletion will split the refund evenly across current members).",
    'pool.expense.editFailed': 'Could not edit pool expense',
    'pool.expense.deleteFailed': 'Could not delete pool expense',
    'pool.expense.insufficientBalanceTitle': 'Not enough pool balance',
    'pool.expense.insufficientBalanceMsg': 'This amount needs {amount} — top up the pool first, then come back and edit.',
    'pool.expense.deleteRefundedMsg': 'Expense deleted — the amount has been refunded back to the pool balance.',
    'pool.expense.deleteSettledRefundTitle': 'Refund split across members',

    'pool.form.currencyHint': 'You can log future payments in a different currency too — e.g. Ringgit at the airport, then Yuan once you land.',
    'pool.settings.topupCountSummary': '{count} payment(s) logged',
    'pool.settings.topupBtn': 'Top up',
    'pool.settings.recordsTitle': 'Top-up Records',
    'pool.settings.editTopupEmptyTitle': 'No top-ups yet',
    'pool.settings.editTopupEmptyDesc': 'Log one first, then you can edit it here.',
    'pool.settings.editTopupMemberCountNote': 'The total is recalculated using the member count at the time this was logged ({count} people) \u2014 unaffected by membership changes since.',
    'pool.settings.editTopupFailed': 'Update failed',
    'pool.expense.payerDisplayName': 'Divvy Duck Pool',
    'pool.settings.topupPreview': '{count} \u00d7 {perPerson} = {total}'
  }
};

// 目前使用的语言（'zh' 或 'en'），预设中文
let currentLang = localStorage.getItem(STORAGE_KEY_LANG) || 'zh';

/**
 * 取得目前语言下指定 key 的文案；找不到时 fallback 回中文，再找不到就回传 key 本身
 * @param {string} key 文案 key，例如 'settlement.markAsPaid'
 * @return {string} 对应的文案
 */
function t(key, params) {
  let text = (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.zh[key] || key;

  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.split(`{${paramKey}}`).join(params[paramKey]);
    });
  }

  return text;
}

/**
 * 套用目前语言：更新所有带 data-i18n 的元素文字，并同步语言切换按钮的显示文字
 * 由于部分内容是 JS 动态产生的（空状态、警示文字等），切换语言后会连带重新渲染这些区块
 */
function applyLanguage() {
  document.documentElement.setAttribute('lang', currentLang === 'zh' ? 'zh-Hans' : 'en');
  document.title = `${t('brand.name')} · ${t('brand.slogan')}`;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });

  // 通用的 aria-label 翻译出口——原本项目里大部分 aria-label 是「静态、跟语言
  // 无关」的场景（例如「关闭」这种到处都是、极少数使用者会真的用螢幕阅读器
  // 深究的按钮），所以一直没有建立这个机制；阶段 9 最终检查时发现二级页面的
  // 返回按钮（.secondary-page-back-btn，阶段 8 新增）应该要跟着语言切换，
  // 干脆一次把机制建起来，之後有类似需求可以直接加 data-i18n-aria-label，
  // 不用再各自写一段 JS 手动同步
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });

  document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
  });

  // 导览上的语言按钮（桌面侧栏、手机抽屉、登入页）现在都是「一点击就直接换下一个语言」，
  // 所以文字要显示「点了会换成哪个语言」（下一个），跟深色模式按钮同一套逻辑；
  // 只有设置页的语言面板还是「打开清单挑」，那边继续显示「目前用的是哪个语言」
  const nextLangLabel = getLanguageNativeLabel(getNextLanguageCode());

  ['langToggleLabel', 'drawerLangToggleLabel', 'authGateLangToggleLabel'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = nextLangLabel;
    }
  });

  // 设置页「语言」面板是给手机版补的另一个入口，文字要显示目前用的是哪个语言（打开清单挑）
  const settingsLangCurrentLabel = document.getElementById('settingsLangCurrentLabel');
  if (settingsLangCurrentLabel) {
    settingsLangCurrentLabel.textContent = getLanguageNativeLabel(currentLang);
  }

  // 深色模式切换按钮的文字也要跟着语言重新翻译一次（内容本身是依「目前主题」决定的，
  // 不是单纯的 data-i18n 静态文字，所以不能靠上面那个通用的 data-i18n 迴圈处理）
  updateThemeToggleLabel(document.documentElement.getAttribute('data-theme'));

  // 欢迎词不依赖旅程资料，语言切换时独立更新一次即可
  renderWelcomeBanner();

  // 更新目前页面的 Header 标题／副标题／按钮文字（这些是 JS 动态设定的，不是 data-i18n）
  const currentPageEl = document.querySelector('.page:not(.is-hidden)');
  if (currentPageEl) {
    updateHeaderForPage(currentPageEl.getAttribute('data-page-section'));
  }

  // 语言切换会影响到几乎所有 JS 动态产生的文字（表格、空状态、徽章、汇率警示等），
  // 只要资料已经载入过，就整个重新渲染一次，确保「整页」都会立即切换语言
  if (document.getElementById('appMain')) {
    if (currentTripId) {
      renderEverything();
    } else if (appState.trips && appState.trips.length === 0) {
      renderNoTripState();
    }
  }
}

/**
 * 绑定导览上所有「一点击就直接换下一个语言」的按钮（桌面侧栏、手机抽屉、登入页），
 * 靠 [data-lang-cycle-btn] 这个共用属性找出所有实例，不管加了几个入口都不用改这支函式。
 * 想从完整清单里挑语言的话，去设置页的语言面板（见 initSettingsLanguageToggle）
 */
function initLanguageToggle() {
  document.querySelectorAll('[data-lang-cycle-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      setLanguage(getNextLanguageCode());
    });
  });
}


/* ------------------------------------------------------------
   1. 全域状态
   ------------------------------------------------------------ */

let currentSplitType = 'equal';
// 记账 Modal 的「资金来源」：normal(正常记账) / deduct(金库支出)
// 只有金库开启的旅程才会显示这个选择器，预设一律是 normal，行为跟合并这个功能之前完全一样
let currentExpenseSource = 'normal';
let modalStack = []; // Modal Stack Manager：依开启顺序记录目前所有开着的 Modal id
// 跟 modalStack 一一对应：每层 Modal 开启当下「原本聚焦在哪个元素」，关闭时要
// 把焦点还回去，键盘／萤幕阅读器使用者才不会在 Modal 关闭后「跟丢」，得从头
// Tab 一次才能回到原本在操作的按钮（见 openModal()／closeTopModalLayer_()）
let modalFocusStack = [];
let secondaryPageStack = []; // 二级页面堆叠：依开启顺序记录目前一路钻进来的二级页面
// id（例如从「账单统计」点进某个分类的「分类消费清单」，会是 ['category-stats',
// 'category-expenses']）。跟 modalStack 是同一个概念，只是这边管的是 .page
// 元素，不是 Modal——阶段 8 把「只读、可能还要继续往下钻」的那 6 个 Modal
// 改成了二级页面，加上原本就是二级页面的成员消费明细，共用同一套机制
// （见 showSecondaryPage_()／closeSecondaryPage_()）
// Modal／侧边抽屉打开时，背景锁住不能捲动用的记录——锁住当下的捲动位置（Y），
// 解锁时要还原回去
let bodyScrollLockY = 0;

/**
 * 锁住背景页面不能捲动（Modal／侧边抽屉打开时用）。
 * ⚠️ 2026-08 改版：不再用 position:fixed 冻结 body。原本的版本先记住
 * 捲动位置，再用 position:fixed + 负值 top 把 body 精准冻结在原本看到
 * 的画面——这个手法在 iOS「加到主屏幕」的 standalone 模式下，键盘弹出/
 * 收起互动時有一个排查六轮（Safari 遠端调试直接量過 window.innerHeight／
 * visualViewport.height／documentElement／body 的实际尺寸，全部正确；
 * 用 Elements 面板的选取元素工具点画面上的空白区域，完全选不到任何
 * DOM 節點）才確認、目前看起來無法从網頁端修正的原生渲染 bug：键盘
 * 收起後 WKWebView 没把渲染范围收回去，底部露出一截連 DOM 都够不著的
 * 空白。换成單純的 overflow:hidden，同時套在 html／body 两层（标准模式
 * 下真正「捲动的那个元素」是 html，只給 body 加不夠），完全不再用
 * position:fixed，从根源避開這整類固定定位＋動態視口的 iOS 怪癖。
 * overflow:hidden 也有個副作用：不少浏览器在切成 hidden 的那一刻会顺手
 * 把捲动位置歸零——如果放著不管，遮罩淡入的 0.35s 動畫期間（這時遮罩
 * 还没完全不透明）使用者會看到背景内容先跳回顶端一下才被蓋住。這裡
 * 記住鎖定前的捲动位置，加上 class 後同一個 tick 內立刻用 scrollTo
 * 補回去——overflow:hidden 只擋使用者手勢/滑鼠捲动，程式呼叫 scrollTo
 * 仍然有效，同步補回不会有任何一帧是歪的。
 * 函式自己侦测背景是不是已经锁住了（例如 Modal 堆叠中又开了第二层、
 * 或者抽屉打开时又跳出了一个 Modal），已经锁住的话就不重复抓一次捲动
 * 位置，不然会把「目前已经是 0（因为已经被鎖住了）」误存成使用者原本
 * 的位置
 */
function lockBodyScroll() {
  if (document.body.classList.contains('body-scroll-locked')) {
    return;
  }
  bodyScrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add('body-scroll-locked');
  document.body.classList.add('body-scroll-locked');
  window.scrollTo(0, bodyScrollLockY);
}

/**
 * 解除背景捲动锁定，并把捲动位置还原回锁定之前的地方
 */
function unlockBodyScroll() {
  document.documentElement.classList.remove('body-scroll-locked');
  document.body.classList.remove('body-scroll-locked');
  window.scrollTo(0, bodyScrollLockY);
}

let currentMemberDetailName = null; // 成员消费明细 Modal 目前显示的成员姓名，供汇出单人 PDF 使用
let editingExpenseId = null;

let currentCategoryFilter = 'all';
let currentSplitTypeFilter = 'all';
let currentSearchKeyword = '';

// 目前选取的旅程 ID（null 代表尚未选择 / 尚无任何旅程）
let currentTripId = null;

const appState = {
  trips: [],
  members: [],
  categories: [],
  expenses: [], // 只会放 scope='group' 的一般消费——'personal' 的在读取层就分流去
  // appState.personalExpenses 了（见 splitExpensesByScope_()），不会出现在这裡，
  // 下游结算/账目页/PDF 报告等所有既有代码天然不可能碰到、不可能污染结算
  personalExpenses: [], // 只有「查看者自己」建立的个人消费会在这裡——RLS 已经保证
  // 撈回来的资料本来就只有自己的，这裡不需要再额外按 created_by 过滤一次
  summary: { balances: [], settlements: [] },
  repayments: [],
  categorySummary: [],
  tripCurrency: { baseCurrency: 'MYR', rates: {}, updatedAt: {} },
  viewerName: '', // 登入的账号在「目前这趟旅程」里对应的成员姓名，由后端 getTripBootstrap 算好
  inviteCode: '', // 目前这趟旅程的邀请码（就是旅程自己的 ID），给邀请卡片显示/复制用
  unclaimedMembers: [], // 这趟旅程里还没连结账号的旧成员，同行页用来提示「合并重复成员」
  canDeleteTrip: true, // 是不是这趟旅程的建立者，决定设置页显示「删除目前旅程」还是「退出旅程」；预设 true 只是还没载到资料前的暂时值
  pool: null // 搭伙金库 (Divvy Pool)：未开启（还没登记过任何一笔打款）时为 null，
             // 结构对应後端 handleGetPool()，详见「10B. 搭伙金库」章节
};

// 目前收据照片上传后取得的网址（尚未储存消费前，暂存在这里）
let currentReceiptUrl = '';
let isUploadingReceipt = false;


/* ------------------------------------------------------------
   2. 初始化入口
   ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  // 这一段都是同步执行、且发生在 initSplashScreen() 之前——只要任何一个 initXxx() 丢出
  // 未预期的例外，後面的 initSplashScreen(revealApp) 就永远不会被呼叫，画面会卡死在
  // 开机 Logo（連 initSplashScreen 自己接住例外的保险都派不上用场，因为根本还没执行到）。
  // 用 try/catch 包住，最糟只是某个次要功能没初始化成功，也绝对不能让整个 App 连
  // 登入画面都进不去
  try {
    renderMainNav();
    initSupabaseAuthListener();
    initLanguageToggle();
    applyLanguage();
    initTheme();
    initAuthGate();
    initPasswordPeekButtons_();
    initOfflineHandling();
    initDashCardSlider();
    initDashCardHeightObserver();
  } catch (error) {
    console.error('App 初始化流程发生错误：', error);
  }

  // 先判断好「等等要显示哪个画面」，但先不要真的解除隐藏——尤其是登入表单，
  // 里面的密码栏位一旦从 is-hidden 变成看得到，手机的自动填写就有机会侦测到、
  // 提早跳出建议，即使画面上还盖著开机动画的 Logo 也一样（手机的自动填写是依
  // DOM 有没有渲染出来判断，不是看画面上盖了什么）。真正的「显示」动作，
  // 交给 initSplashScreen 的回呼，等开机动画播完、正要淡出的那一刻才执行，
  // 把密码栏位曝光的时间从「整段开机动画」缩到最短
  let revealApp;

  if (isPasswordRecoveryRedirect()) {
    // 如果是从「忘记密码」的 Email 连结点进来的，不管现在有没有登入 Session，
    // 一律先导去「设定新密码」这步，等设完密码才进登入/App
    revealApp = () => {
      showAuthGate();
      showAuthGateResetStep();
    };
  } else {
    // getSession() 会先等 Supabase 函式库把网址里可能带的登入资讯解析完才回传结果，
    // 所以这里可以放心把它当成「目前登入状态」的最终答案来判断
    const { data } = await supabaseClient.auth.getSession();
    currentSupabaseSession = data.session;

    if (currentSupabaseSession) {
      revealApp = () => {
        enterAppShell();
        startAppAfterAuth();
      };
    } else {
      // 没有有效登入的账号 Session，一律先卡在全萤幕登入闸门，看不到任何 App 内容/资料，
      // 直到 signup / login 成功才会呼叫 startAppAfterAuth() 真正进入 App
      revealApp = showAuthGate;
    }
  }

  initSplashScreen(revealApp);
});

/**
 * 开机品牌动画：固定盖住画面 MIN_DISPLAY_MS 毫秒，纯粹给 Logo/DivvyDuck 字样
 * 的动画播完。authGate / appShell 的显示（onReveal）刻意跟动画「正要淡出」的
 * 那一刻绑在一起才执行，不是一开始就做好——这样登入表单（尤其密码栏位）只会
 * 在动画淡出的这一小段时间内跟画面同时存在，不会在整段开机动画期间就已经
 * 曝光在画面上，避免手机的自动填写提早跳出来挡住还在显示的 Logo
 * @param {Function} onReveal 动画正要开始淡出时执行：显示登入闸门或 App 主体
 */
function initSplashScreen(onReveal) {
  const splash = document.getElementById('appSplash');
  if (!splash) {
    if (onReveal) onReveal(); // 理论上不会发生，至少不能卡住整个 App 没有任何画面
    return;
  }

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_DISPLAY_MS = prefersReducedMotion ? 300 : 2000;

  window.setTimeout(() => {
    // onReveal（登入闸门／App 主体的显示逻辑）万一丢出未预期的错误，也绝对不能让
    // 开机 Logo 卡住不放——那样使用者连错误讯息都看不到，只会以为整个 App 死了。
    // 这里接住任何例外、印到 console 方便除错，接着照样把闪屏拿掉
    try {
      if (onReveal) onReveal();
    } catch (error) {
      console.error('App 启动流程发生错误：', error);
    }
    splash.classList.add('is-leaving');
    const removeSplash = () => splash.remove();
    splash.addEventListener('transitionend', removeSplash, { once: true });
    // 保险：万一 transitionend 没触发（例如分頁切到背景、动画被中途打断），
    // 还是要确保闪屏最终一定会被拿掉，不会卡住整个 App
    window.setTimeout(removeSplash, 600);
  }, MIN_DISPLAY_MS);
}

/**
 * 判断目前网址是不是从「忘记密码」信件里的重设连结点进来的——
 * Supabase 会在网址 # 后面带 access_token=...&type=recovery 这样的参数
 * @return {boolean}
 */
function isPasswordRecoveryRedirect() {
  const hash = window.location.hash || '';
  return hash.includes('type=recovery');
}

/**
 * 登入/注册成功后才会真正跑的 App 初始化流程
 */
function startAppAfterAuth() {
  initNavigation();
  initModals();
  initAppHistoryNavigation();
  initSecondaryPageBackButtons_();
  initSegmentedControl();
  initSmartMemory();
  initExpenseDraftAutosave();
  initSettingsPage();
  initCategoryManage();
  initCurrencySettings();
  initExpenseFilters();
  initTripSwitcher();
  initTripPicker();
  initSelectAllParticipants();
  initRepaymentForm();
  initEditRepaymentForm();
  initSelectAllRepaymentFrom();
  initReceiptUploader();
  initReceiptViewer();
  initDangerZone();
  initSettleAllButton();
  initQuickActionsDock();
  initDuplicateMemberBanner();
  initPdfExport();
  initMemberPdfExport();
  initAccountPanel();
  initLogoutButtons();
  initTouchGestures();
  initSettingsLanguageToggle();
  initJoinTripForm();
  initInviteCard();
  setDefaultExpenseDate();
  setDefaultRepaymentDate();
  enableEasyDatePicker('expenseDate');
  enableEasyDatePicker('repaymentDate');
  updateHeaderForPage('dashboard'); // 修正：首次载入时也要设定 Header 按钮，否则「新增消费」点不了
  positionNavIndicator();
  renderWelcomeBanner(); // 不必等旅程资料载入完成，登入了就先打招呼
  renderExpiringTripsPanel_(); // 跨旅程层级的提醒，同样不必等旅程资料载入完成

  window.addEventListener('resize', debounce(positionNavIndicator, 120));

  bootstrapApp();
}

/**
 * App 启动流程：先载入旅程清单，决定目前使用的旅程，再载入该旅程的资料
 */
async function bootstrapApp() {
  renderDashboardSkeleton();

  try {
    let trips;
    try {
      trips = await fetchTrips_();
      cacheTripsList_(trips);
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error;
      }
      const cachedTrips = getCachedTripsList_();
      if (!cachedTrips) {
        throw error;
      }
      trips = cachedTrips.data;
      staleDataCachedAt = cachedTrips.cachedAt;
    }

    appState.trips = trips || [];
    renderTripSelect();

    if (appState.trips.length === 0) {
      currentTripId = null;
      clearHeroCardSkeletonToEmpty_();
      renderNoTripState();
      return;
    }

    currentTripId = resolveInitialTripId();
    applyTripMeta_(currentTripId);
    setTripSelectValues(currentTripId);

    await loadTripData();
    flushOfflineQueue(); // 如果上次关闭 App 时还留着没送出去的离线纪录、现在又是有网路的，顺便补送掉
  } catch (error) {
    showToast('error', t('toast.loadFailed'), error.message);
    clearHeroCardSkeletonToEmpty_();
    renderApiErrorState(error.message);
  }
}

/**
 * 从 Supabase 撈取「自己有加入的旅程」清单——不用自己过滤，RLS 规则（is_trip_member）
 * 已经保证只会撈到自己相关的旅程
 * @return {Array<{id, name, createdAt, updatedAt, baseCurrency, inviteCode, createdBy}>}
 */
async function fetchTrips_() {
  let { data, error } = await supabaseClient
    .from('trips')
    .select('id, name, created_at, updated_at, base_currency, invite_code, created_by')
    .eq('deleted', false)
    .order('created_at', { ascending: true });

  if (error) {
    // updated_at 这个欄位如果後端资料表是旧版 schema、还没加上，上面那次查询会报错——
    // 降级成不带这个欄位重查一次，旅程清单至少还读得出来，只是「排序换成最后更新
    // 时间」这个功能会退回照建立时间排（下面 updatedAt 会 fallback 回 createdAt）
    const fallback = await supabaseClient
      .from('trips')
      .select('id, name, created_at, base_currency, invite_code, created_by')
      .eq('deleted', false)
      .order('created_at', { ascending: true });
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    baseCurrency: row.base_currency,
    inviteCode: row.invite_code,
    createdBy: row.created_by
  }));
}

/**
 * 同步「目前这趟旅程」的建立者身份／邀请码到 appState，供危险区域按钮跟邀请卡片使用
 * 旧资料（没有 createdBy）比照後端原本的行为：视为任何成员都能删除
 * @param {string} tripId
 */
function applyTripMeta_(tripId) {
  const trip = appState.trips.find((item) => item.id === tripId);
  const session = getUserSession();

  appState.canDeleteTrip = !trip || !trip.createdBy || (session && trip.createdBy === session.userId);
  appState.inviteCode = trip ? (trip.inviteCode || '') : '';
  repaymentScopeShowAll_ = false; // 换旅程了，还款纪录的显示范围归零，从「只看与我相关」重新开始

  renderDangerZoneButton();
  renderInviteCard();
}


/**
 * 决定初次进入时要使用哪个旅程：优先使用浏览器先前记住的旅程（若仍存在），否则用第一个
 * @return {string} 旅程 ID
 */
function resolveInitialTripId() {
  const savedTripId = localStorage.getItem(STORAGE_KEY_CURRENT_TRIP);
  const stillExists = appState.trips.some((trip) => trip.id === savedTripId);
  return stillExists ? savedTripId : appState.trips[0].id;
}


/* ------------------------------------------------------------
   2B. 全域账号登入闸门（Auth Gate）
   进 App 前一定要先登入或注册，闸门关着的时候 .app-shell 完全不会显示，
   所有资料（旅程/消费/结算……）都不会被载入或看到
   ------------------------------------------------------------ */

/**
 * 显示登入闸门、隐藏 App 主体
 */
function showAuthGate() {
  const gate = document.getElementById('authGate');
  const shell = document.getElementById('appShell');
  if (gate) gate.classList.remove('is-hidden');
  if (shell) shell.classList.add('is-hidden');
  showAuthGateAuthStep();
}

/**
 * 隐藏登入闸门里的每一个步骤（登入注册 / 忘记密码 / 设定新密码），
 * 每次要切换到某一步之前，先全部藏起来再单独打开该步骤，避免同时看到两个步骤
 */
function hideAllAuthGateSteps() {
  ['authGateAuthStep', 'authGateForgotStep', 'authGateResetStep'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('is-hidden');
  });
}

/**
 * 显示「忘记密码」这步：只需要填用户名，送出后由後端寄出重设连结
 */
function showAuthGateForgotStep() {
  hideAllAuthGateSteps();
  const forgotStep = document.getElementById('authGateForgotStep');
  if (forgotStep) forgotStep.classList.remove('is-hidden');
}

/**
 * 显示「设定新密码」这步：使用者从 Email 里的重设连结点进来时会直接卡在这里
 * （不再需要手动带 token——Supabase 已经透过网址自动帮我们建立好一个临时登入 Session）
 */
function showAuthGateResetStep() {
  hideAllAuthGateSteps();
  const resetStep = document.getElementById('authGateResetStep');
  if (resetStep) {
    resetStep.classList.remove('is-hidden');
  }
}

/**
 * 回到「登入/注册」这步（例如忘记密码或设定新密码流程里点了「返回登入」）
 */
function showAuthGateAuthStep() {
  hideAllAuthGateSteps();
  const authStep = document.getElementById('authGateAuthStep');
  if (authStep) authStep.classList.remove('is-hidden');
}

/**
 * 隐藏登入闸门、显示 App 主体
 */
function enterAppShell() {
  const gate = document.getElementById('authGate');
  const shell = document.getElementById('appShell');
  if (gate) gate.classList.add('is-hidden');
  if (shell) shell.classList.remove('is-hidden');
}

/**
 * 把名字格式化成「每个空格分隔的单字，第一个字母大写、其余小写」——
 * 例如 "wei ling" 变成 "Wei Ling"——跟後端 formatProperCase_ 用同一套逻辑，
 * 让使用者打完字、离开栏位时就立刻看到格式化后的样子，不用等送出表单才看到结果
 * @param {string} text 原始文字
 * @return {string} 格式化后的文字
 */
function formatProperCaseClientSide(text) {
  return String(text || '').trim().toLowerCase().split(/\s+/).map((word) => {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }).join(' ');
}

/**
 * 给页面上每一个密码栏位都加一颗「按住看明文、放开就盖回去」的按钮——
 * 不是点一下常亮到再点一次关掉的切换钮，是按住才显示，放开立刻恢复遮罩。
 * 用 JS 动态包一层 wrapper、插入按钮，而不是在每个密码栏位各自手写一份
 * 重複的 HTML，之後新增密码栏位也会自动套用，不用记得每次都手动加。
 * 只需要在开机时跑一次——所有密码栏位（登入/注册/忘记密码重设/帐号设置
 * 改密码）都是一开始就在 DOM 裡的静态 HTML，只是外层用 class 藏起来，
 * 不会晚於这个时间点才动态生成
 */
function initPasswordPeekButtons_() {
  const inputs = document.querySelectorAll('input[type="password"]');
  inputs.forEach((input) => {
    if (input.parentElement.classList.contains('password-field-wrapper')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-peek-btn';
    btn.setAttribute('aria-label', t('common.showPassword'));
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6"/></svg>';
    wrapper.appendChild(btn);

    const show = () => {
      input.type = 'text';
      btn.classList.add('is-peeking');
    };
    const hide = () => {
      input.type = 'password';
      btn.classList.remove('is-peeking');
    };

    // touchstart 先 preventDefault，才不会在放开手指後又跟着补一組合成的
    // mousedown/mouseup，害「按住看明文」在手机上变成看得到但立刻又蓋回去
    btn.addEventListener('mousedown', (event) => { event.preventDefault(); show(); });
    btn.addEventListener('touchstart', (event) => { event.preventDefault(); show(); }, { passive: false });
    btn.addEventListener('mouseup', hide);
    btn.addEventListener('mouseleave', hide);
    btn.addEventListener('touchend', hide);
    btn.addEventListener('touchcancel', hide);
  });
}

/**
 * 绑定登入闸门上的所有互动：登入/注册分页切换、两个表单的送出
 */
function initAuthGate() {
  const gate = document.getElementById('authGate');
  if (!gate) {
    return;
  }

  const loginTabBtn = document.getElementById('authGateLoginTab');
  const signupTabBtn = document.getElementById('authGateSignupTab');
  const loginForm = document.getElementById('authLoginForm');
  const signupForm = document.getElementById('authSignupForm');

  const setAuthGateTab = (tab) => {
    const isLogin = tab === 'login';
    loginTabBtn.classList.toggle('is-active', isLogin);
    signupTabBtn.classList.toggle('is-active', !isLogin);
    loginForm.classList.toggle('is-hidden', !isLogin);
    signupForm.classList.toggle('is-hidden', isLogin);
  };

  loginTabBtn.addEventListener('click', () => setAuthGateTab('login'));
  signupTabBtn.addEventListener('click', () => setAuthGateTab('signup'));

  gate.querySelectorAll('[data-auth-gate-switch]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setAuthGateTab(link.getAttribute('data-auth-gate-switch'));
    });
  });

  // 提醒讯息里现在会附一个「?invite=邀请码」的连结（见 bindBalanceMatrixRemindButtons_()），
  // 收到讯息的人点进来，直接帮他切到注册分页、邀请码也预填好，不用自己再去问
  // 邀请码是什么、也不用手动切分页——降低「点了链接却不知道要做什么」的落差
  const urlInviteCode = new URLSearchParams(window.location.search).get('invite');
  if (urlInviteCode) {
    setAuthGateTab('signup');
    const inviteInput = document.getElementById('authSignupInviteCode');
    if (inviteInput) {
      inviteInput.value = urlInviteCode;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('authLoginEmail').value.trim();
    const password = document.getElementById('authLoginPassword').value;
    const submitBtn = document.getElementById('authLoginSubmitBtn');

    setButtonLoading(submitBtn, true);
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuthSuccess({});
    } catch (error) {
      showToast('error', t('authGate.loginFailed'), error.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // First / Last Name 打完字、离开栏位时就立刻转成「每个字首大写」的格式，
  // 让使用者马上看到效果，不用等送出表单、去 Google Sheet 里才看得到——
  // 跟後端 formatProperCase_ 用同一套逻辑，两边结果会一致
  ['authSignupFirstName', 'authSignupLastName'].forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener('blur', () => {
        input.value = formatProperCaseClientSide(input.value);
      });
    }
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    // 按下去的当下就要马上进入 loading 状态，不能等到「检查有没有旧成员可以认领」这个
    // 网路请求跑完才显示——Apps Script 常常要等好几秒，中间完全没有视觉回馈的话，
    // 使用者会不确定自己到底有没有点到，容易重复点击
    const submitBtn = document.getElementById('authSignupSubmitBtn');
    setButtonLoading(submitBtn, true);

    try {
      // 两个语言现在栏位顺序都是「姓氏／Last Name 在前，名字／First Name 在後」，
      // 不再依语言对调——DOM id 上的 First/Last 字面意思因此跟語意是反过来的
      // （#authSignupFirstName 顯示的其实是姓氏栏位，#authSignupLastName 顯示的
      // 才是名字栏位），千万不能直接假设 DOM id 就等于语意上的名/姓
      const surname = document.getElementById('authSignupFirstName').value.trim();
      const givenName = document.getElementById('authSignupLastName').value.trim();
      const nickname = document.getElementById('authSignupNickname').value.trim();
      const password = document.getElementById('authSignupPassword').value;
      const email = document.getElementById('authSignupEmail').value.trim();
      const inviteCode = document.getElementById('authSignupInviteCode').value.trim();
      const claimField = document.getElementById('authSignupClaimMemberField');
      const claimSelect = document.getElementById('authSignupClaimMemberSelect');

      // 填了邀请码、但这个邀请码还没检查过有没有旧成员可以认领（例如打完字马上按注册，
      // debounce 还没跑完）——这里补做一次检查
      if (inviteCode && claimSelect.dataset.checkedCode !== inviteCode) {
        await checkClaimMemberOptions(inviteCode, claimField, claimSelect);
      }

      // 只要画面上有列出「可以认领的旧成员」选项，就一定要使用者亲手选过（哪怕选的是
      // 「不是以上任何一位」），才让送出继续往下走——不然下拉预设停在第一个选项，
      // 使用者没注意到的话就会悄悄用「新建成员」送出，旧成员的历史纪录永远接不回来
      if (!claimField.classList.contains('is-hidden') && claimSelect.dataset.userChosen !== 'true') {
        showToast('info', t('authGate.claimMemberReviewTitle'), t('authGate.claimMemberReviewMsg'));
        return;
      }

      // '__unselected__' 是下拉预设值（使用者一定得亲手选过才会离开这个值，上面已经挡过），
      // 空字串代表使用者选的是「不是以上任何一位」，两种都当成「不认领」
      const rawClaimValue = claimSelect.value;
      const claimMemberId = (rawClaimValue && rawClaimValue !== '__unselected__') ? rawClaimValue : null;
      const displayName = nickname || givenName;

      const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: givenName, last_name: surname, nickname: displayName }
        }
      });
      if (signUpError) throw signUpError;

      // 如果 Supabase 项目开启了「需验证 Email 才能登入」，这里 session 会是 null，
      // 使用者必须先去信箱点验证连结，这里先提示、暂不进 App（等设定 Auth 时我们会一起确认这个开关）
      if (!signUpData.session) {
        showToast('success', t('authGate.signupSuccessTitle'), t('authGate.signupSuccessMsg'));
        return;
      }

      let joinedTripId = null;
      if (inviteCode) {
        const { data: tripId, error: joinError } = await supabaseClient.rpc('join_trip_by_code', {
          _invite_code: inviteCode,
          _claim_member_id: claimMemberId,
          _display_name: displayName
        });
        if (joinError) throw joinError;
        joinedTripId = tripId;
      }

      onAuthSuccess({ joinedTripId });
    } catch (error) {
      showToast('error', t('authGate.signupFailed'), error.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // 忘记密码：点连结进入「输入用户名」这步
  const forgotPasswordLink = document.getElementById('authGateForgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (event) => {
      event.preventDefault();
      showAuthGateForgotStep();
    });
  }

  const backToLoginFromForgotLink = document.getElementById('authGateBackToLoginFromForgotLink');
  if (backToLoginFromForgotLink) {
    backToLoginFromForgotLink.addEventListener('click', (event) => {
      event.preventDefault();
      showAuthGateAuthStep();
      setAuthGateTab('login');
    });
  }

  const backToLoginFromResetLink = document.getElementById('authGateBackToLoginFromResetLink');
  if (backToLoginFromResetLink) {
    backToLoginFromResetLink.addEventListener('click', (event) => {
      event.preventDefault();
      showAuthGateAuthStep();
      setAuthGateTab('login');
    });
  }

  const forgotForm = document.getElementById('authForgotForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = document.getElementById('authForgotEmail').value.trim();
      const submitBtn = document.getElementById('authForgotSubmitBtn');

      setButtonLoading(submitBtn, true);
      try {
        // redirectTo：使用者点信里的连结后会被带回这个网址，网址会自动带上 Supabase 的
        // 临时登入资讯（#access_token=...&type=recovery），isPasswordRecoveryRedirect()
        // 就是靠侦测这个来判断要不要直接跳到「设定新密码」这步
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });
        if (error) throw error;
        showToast('success', t('toast.resetLinkSent'), t('toast.resetLinkSentMsg'));
        showAuthGateAuthStep();
        setAuthGateTab('login');
      } catch (error) {
        showToast('error', t('toast.resetLinkFailed'), error.message);
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  const resetForm = document.getElementById('authResetForm');
  if (resetForm) {
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const newPassword = document.getElementById('authResetNewPassword').value;
      const submitBtn = document.getElementById('authResetSubmitBtn');

      setButtonLoading(submitBtn, true);
      try {
        // 不需要手动带 token——点连结进来的当下，Supabase 已经透过网址自动帮我们
        // 建立好一个临时登入 Session，这里直接改这个 Session 的密码就好
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        showToast('success', t('toast.passwordResetDone'), t('toast.passwordResetDoneMsg'));
        resetForm.reset();
        showAuthGateAuthStep();
        setAuthGateTab('login');
      } catch (error) {
        showToast('error', t('toast.resetLinkFailed'), error.message);
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // 注册时填邀请码：如果这趟旅程有「还没建立账号」的旧成员，问一下是不是本人，是的话就直接
  // 认领这个身份，让过去用那个名字记的消费自动接续到新账号名下，不会被拆成两个人
  initClaimMemberPicker({
    inviteInputId: 'authSignupInviteCode',
    fieldId: 'authSignupClaimMemberField',
    selectId: 'authSignupClaimMemberSelect'
  });
}

/**
 * 实际去查「这个邀请码的旅程里，有没有还没建立账号的旧成员可以认领」，并把结果套用到画面上
 * 两个地方共用：绑定 input 事件的即时预览（debounce），以及送出表单前的强制检查（见下方两个 fix）
 * 检查完会把这次检查过的邀请码记在 select.dataset.checkedCode 上，让送出表单时可以判断
 * 「使用者有没有真的看过这次的选项」，而不是照抄输入框当下的值就直接送出
 * @param {String} inviteCode 邀请码
 * @param {HTMLElement} field 整个选择区块（含 label + select + hint）
 * @param {HTMLSelectElement} select 成员下拉选单
 * @return {Promise<Array<{memberId: String, name: String}>>} 查到的未认领成员清单
 */
async function checkClaimMemberOptions(inviteCode, field, select) {
  if (!inviteCode) {
    field.classList.add('is-hidden');
    field.classList.remove('is-already-member');
    select.innerHTML = '';
    delete select.dataset.checkedCode;
    delete select.dataset.userChosen;
    delete select.dataset.alreadyMember;
    return [];
  }

  try {
    const { data: rows, error } = await supabaseClient.rpc('preview_invite_code', { _invite_code: inviteCode });
    if (error) throw error;

    // RPC 回传的是一列一列的资料表：已经是成员的话，会是「一列、member_id 是空的」；
    // 不是成员的话，会是「零到多列，每列是一个可认领的旧成员」——这里换算回原本的形状，
    // 让下面沿用原本就写好的渲染逻辑，不用大改
    const alreadyMember = rows && rows.length > 0 && rows[0].already_member === true;
    const noticeEl = field.querySelector('.claim-member-already-notice');

    // 已经是这趟旅程的成员了：不用再跑一次「你是哪一位」的认领流程，
    // 直接把栏位切成「只显示提示文字」，送出表单那边也会挡（见对应的 submit handler），
    // 这里单纯是提早把话讲清楚，不要让使用者选到一半才发现白选
    field.classList.toggle('is-already-member', alreadyMember);
    if (noticeEl) {
      noticeEl.classList.toggle('is-hidden', !alreadyMember);
    }
    select.dataset.alreadyMember = alreadyMember ? 'true' : 'false';

    if (alreadyMember) {
      select.innerHTML = '';
      delete select.dataset.userChosen;
      select.dataset.checkedCode = inviteCode;
      field.classList.remove('is-hidden');
      return [];
    }

    const unclaimedMembers = (rows || [])
      .filter((row) => row.member_id)
      .map((row) => ({ memberId: row.member_id, name: row.member_name }));

    select.innerHTML = '';
    // 每次重新查到的选项都算「还没被使用者确认过」，就算跟上一次查到的一样，
    // 也要重新等使用者亲手选一次，避免残留上一轮的「已选择」状态
    delete select.dataset.userChosen;

    if (unclaimedMembers.length === 0) {
      field.classList.add('is-hidden');
    } else {
      // 关键：这个预设的「请选择」选项本身是 disabled，一开始就被选中，
      // 这样不管使用者最后选的是「都不是」还是某位旧成员，都一定要亲手动过下拉一次，
      // 才会触发 change 事件、把 userChosen 标记成 true。
      // 如果没有这个 placeholder，「都不是」会是清单里第一个选项，
      // 一开始就自动被选中——使用者如果本来就是要选「都不是」，
      // 下拉一开始显示的答案就已经是对的，根本不用去点它，change 事件永远不会触发，
      // 送出表单时就会被「你还没确认」这个安全机制卡住，变成「都不是」这个选项实际上选不了
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '__unselected__';
      placeholderOption.textContent = t('authGate.claimMemberPlaceholder');
      placeholderOption.disabled = true;
      placeholderOption.selected = true;
      select.appendChild(placeholderOption);

      const noneOption = document.createElement('option');
      noneOption.value = '';
      noneOption.textContent = t('authGate.claimMemberNoneOption');
      select.appendChild(noneOption);

      unclaimedMembers.forEach((member) => {
        const option = document.createElement('option');
        option.value = member.memberId;
        option.textContent = member.name;
        select.appendChild(option);
      });

      field.classList.remove('is-hidden');
    }

    select.dataset.checkedCode = inviteCode;
    return unclaimedMembers;
  } catch (error) {
    // 邀请码可能还没打完、或本来就是错的——静默失败即可，不用打扰使用者，
    // 邀请码到底对不对，送出表单时後端还是会再验证一次
    field.classList.add('is-hidden');
    field.classList.remove('is-already-member');
    select.innerHTML = '';
    delete select.dataset.checkedCode;
    delete select.dataset.userChosen;
    delete select.dataset.alreadyMember;
    return [];
  }
}

/**
 * 绑定「输入邀请码后，即时预览这趟旅程有没有还没建立账号的旧成员可以认领」
 * 用在两个地方：注册表单的邀请码栏位、加入旅程 Modal 的邀请码栏位，逻辑完全一样
 * 这只是「打字时的即时预览」，真正防止漏看的把关在送出表单那一刻（见对应的 submit handler）
 * @param {{inviteInputId: string, fieldId: string, selectId: string}} config
 */
function initClaimMemberPicker(config) {
  const inviteInput = document.getElementById(config.inviteInputId);
  const field = document.getElementById(config.fieldId);
  const select = document.getElementById(config.selectId);

  if (!inviteInput || !field || !select) {
    return;
  }

  const debouncedCheck = debounce(() => {
    checkClaimMemberOptions(inviteInput.value.trim(), field, select);
  }, 500);

  inviteInput.addEventListener('input', debouncedCheck);

  // 使用者亲手选过一次（就算选的是「不是以上任何一位」也算），才把这个下拉标记成「已确认」；
  // 光是选项被程式填好、但使用者根本没动过下拉，不能算是「使用者确认过是哪一位」
  select.addEventListener('change', () => {
    select.dataset.userChosen = 'true';
  });
}

/**
 * 登入或注册成功后共用的收尾流程：切换到 App 主体、开始载入资料
 * （登入 Session 现在交给 Supabase Auth 自动管理，不用像以前手动存了）
 * 不另外跳欢迎 toast——概览页本身就有欢迎词（renderWelcomeBanner），再跳一次是重复的
 * @param {{joinedTripId: (string|null)}} result
 */
function onAuthSuccess(result) {
  result = result || {};

  // 注册时若带了邀请码并成功加入旅程，直接把这趟旅程记成「目前旅程」，省去还要手动切换
  if (result.joinedTripId) {
    localStorage.setItem(STORAGE_KEY_CURRENT_TRIP, result.joinedTripId);
  }

  enterAppShell();
  startAppAfterAuth();
}


/**
 * 判断一个错误是不是「网路层级」的问题（离线、连线中断……），而不是伺服器有正常回应、
 * 只是回应内容代表失败的那种。除了看 fetch() 典型的 TypeError／关键字之外，
 * 也一并看 navigator.onLine——只要浏览器本身就知道现在没有网路，几乎可以确定是这一类问题
 * @param {Error} error
 * @return {boolean}
 */
function isNetworkError(error) {
  if (!error) {
    return false;
  }
  if (error.isNetworkError === true) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const message = String(error.message || '').toLowerCase();
  return error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed'); // Safari 的说法
}


/* ------------------------------------------------------------
   4B. 离线韧性（Offline Resilience）
   ------------------------------------------------------------
   旅途中网路常常不稳（山区、地铁、跨境漫游还没接上……），这里处理两件事，
   刻意不做成「所有写入动作都能离线」的完整方案——范围拉太大，编辑/删除这类
   会跟别人的改动互相冲突的操作，离线支援起来风险不成比例：
   1. 读：离线打开 App／原本开着突然断线，用「上一次连线成功拉到的资料」撑住画面
   2. 写：只有「新增消费」——最常见、也最安全（纯新增，不会跟其他人的修改冲突）
      的动作支援离线暂存＋恢复连线后自动补送；其他写入动作离线时仍会直接失败
   ------------------------------------------------------------ */

// 目前画面上显示的是不是「离线时用快取顶著」的旧资料；不是 null 就代表是，
// 值是这份快取当初存下来的时间戳记，用来在横幅上告诉使用者这资料多旧
let staleDataCachedAt = null;

/**
 * 把「取得旅程清单」的结果快取起来，供离线开启 App 时顶著用
 */
function cacheTripsList_(trips) {
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS_CACHE, JSON.stringify({ data: trips, cachedAt: Date.now() }));
  } catch (error) {
    // localStorage 已满或被浏览器挡掉，快取失败不影响正常使用，安静略过
  }
}

function getCachedTripsList_() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_TRIPS_CACHE));
    return (parsed && parsed.data) ? parsed : null;
  } catch (error) {
    return null;
  }
}

/**
 * 把某趟旅程最近一次成功拉到的 getTripBootstrap 结果存进 localStorage
 * @param {string} tripId
 * @param {Object} bootstrap
 */
function cacheTripBootstrap_(tripId, bootstrap) {
  try {
    localStorage.setItem(STORAGE_KEY_TRIP_CACHE_PREFIX + tripId, JSON.stringify({
      data: bootstrap,
      cachedAt: Date.now()
    }));
  } catch (error) {
    // 同上，安静略过
  }
}

function getCachedTripBootstrap_(tripId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_TRIP_CACHE_PREFIX + tripId));
    return (parsed && parsed.data) ? parsed : null;
  } catch (error) {
    return null;
  }
}

/**
 * 依目前语言把一个时间戳记格式化成「几点几分」，给离线横幅显示「资料截至几点」用
 * @param {number} timestampMs
 * @return {string}
 */
function formatCacheTime_(timestampMs) {
  try {
    return new Date(timestampMs).toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'zh-Hans-TW', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '';
  }
}

/* ---- 离线「新增消费」队列 ---- */

function getOfflineQueue_() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_OFFLINE_QUEUE)) || [];
  } catch (error) {
    return [];
  }
}

function saveOfflineQueue_(queue) {
  try {
    localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(queue));
  } catch (error) {
    // 同上，安静略过——极端情况下这批离线纪录补送不了，但至少不会让 App 当掉
  }
}

/**
 * 离线时把一笔「新增消费」的请求参数暂存进本地队列，并回传一个「看起来跟正常消费物件一样」
 * 的暂存物件，让呼叫端可以立刻乐观地插进 appState.expenses 显示（标一个「待同步」徽章）
 * @param {Object} payload 原本要写进 Supabase expenses 表的参数
 * @return {Object} 暂存用的消费物件，ID 是 'LOCAL-' 开头、_pendingSync 为 true
 */
function queueOfflineExpense(payload) {
  const localId = 'LOCAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const queue = getOfflineQueue_();
  queue.push({ localId, payload, queuedAt: Date.now() });
  saveOfflineQueue_(queue);

  const nameToId = (appState.memberIndex && appState.memberIndex.byName) || {};

  return {
    ID: localId,
    TripID: payload.tripId,
    Date: payload.date || new Date().toISOString(),
    CreatedAt: new Date().toISOString(),
    Payer: payload.payer,
    PayerId: nameToId[payload.payer] || null,
    Amount: Number(payload.amount) || 0,
    Currency: payload.currency,
    Category: payload.category,
    Description: payload.description || '',
    SplitType: payload.splitType,
    Participants: payload.participants || [],
    ParticipantIds: (payload.participants || []).map((name) => nameToId[name]).filter(Boolean),
    CustomSplit: payload.customSplit || {},
    CustomSplitById: mapCustomSplitNamesToIds_(payload.customSplit, nameToId),
    Receipt: payload.receipt || '',
    Remark: payload.remark || '',
    Deleted: false,
    Scope: payload.scope || 'group',
    CanManage: false, // 还没真正存进後端、连正式 ID 都没有，先不给编辑/删除
    ExchangeRateSnapshot: 0,
    _pendingSync: true
  };
}

let isFlushingOfflineQueue_ = false;

/**
 * 网路恢复时呼叫：把队列里暂存的「新增消费」依序补送到後端。
 * - 成功：从队列移除，画面上那笔暂存资料换成後端回传的正式资料（正式 ID、CanManage 等等）
 * - 因为网路问题又失败：留在队列里，等下一次触发（下一次 online 事件、或下次登入）再试，
 *   不中断整批，让排在後面、有机会成功的其他笔继续补送
 * - 因为後端明确拒绝（例如验证失败，不是网路问题）：这笔多试也不会成功，从队列移除，
 *   同时把画面上那笔暂存资料拿掉，避免卡住後面所有笔；使用者可以照通知内容自己重新记一笔
 */
async function flushOfflineQueue() {
  if (isFlushingOfflineQueue_) {
    return; // 避免短时间内连续收到好几次 online 事件，重复触发好几轮补送
  }

  const queue = getOfflineQueue_();
  if (queue.length === 0) {
    updateOfflineBanner();
    return;
  }

  isFlushingOfflineQueue_ = true;
  updateOfflineBanner({ syncing: true, pendingCount: queue.length });

  let syncedCount = 0;
  let droppedCount = 0;
  const stillPending = [];

  for (const item of queue) {
    // 用「暂存当下记的 scope」决定这笔待补送的消费该找哪个阵列——跟
    // queueOfflineExpense() 塞乐观资料时用的是同一个判断依据，两边要一致，
    // 不然补送成功後会更新到「暂存时明明不在」的那个阵列，留下一个永远
    // 清不掉的幽灵 LOCAL- 暂存项
    const targetArray = item.payload.scope === 'personal' ? appState.personalExpenses : appState.expenses;

    try {
      const row = translateExpensePayloadForWrite_(item.payload);
      const { data, error } = await supabaseClient.from('expenses').insert(row).select().single();
      if (error) throw error;
      const savedExpense = expenseRowToOldShape_(data);

      const index = targetArray.findIndex((expense) => expense.ID === item.localId);
      if (index !== -1) {
        targetArray.splice(index, 1, savedExpense);
      } else if (currentTripId && String(item.payload.tripId) === String(currentTripId)) {
        targetArray.push(savedExpense);
      }

      syncedCount += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        stillPending.push(item); // 还是没网路，留着下次再试
      } else {
        droppedCount += 1;
        const index = targetArray.findIndex((expense) => expense.ID === item.localId);
        if (index !== -1) {
          targetArray.splice(index, 1);
        }
      }
    }
  }

  saveOfflineQueue_(stillPending);
  isFlushingOfflineQueue_ = false;

  if (syncedCount > 0 || droppedCount > 0) {
    if (currentTripId) {
      appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
      appState.categorySummary = computeCategorySummaryClient_();

      renderDashboard();
      renderExpensesTable();
      renderSummaryPage();
      renderCategorySummary();
      renderCurrencySettings();
    }

    if (syncedCount > 0) {
      showToast('success', t('offline.syncSuccessTitle'), t('offline.syncSuccessMsg', { count: syncedCount }));
    }
  }

  if (stillPending.length > 0) {
    showToast('error', t('offline.syncFailedTitle'), t('offline.syncFailedMsg', { count: stillPending.length }));
  }

  updateOfflineBanner();
}

/**
 * 更新画面最上方的离线状态横幅：没有网路连线、正在补送离线队列、或画面显示的是
 * 离线快取的旧资料时才会出现；平常（有网路、没有待同步资料、资料是最新的）保持隐藏
 * @param {{syncing?: boolean, pendingCount?: number}} [options]
 */
function updateOfflineBanner(options) {
  const banner = document.getElementById('offlineBanner');
  const textEl = document.getElementById('offlineBannerText');
  if (!banner || !textEl) {
    return;
  }

  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const pendingCount = (options && typeof options.pendingCount === 'number')
    ? options.pendingCount
    : getOfflineQueue_().length;
  const syncing = Boolean(options && options.syncing);

  banner.classList.remove('is-syncing');

  if (syncing && pendingCount > 0) {
    banner.classList.remove('is-hidden');
    banner.classList.add('is-syncing');
    textEl.textContent = t('offline.bannerSyncing', { count: pendingCount });
    return;
  }

  if (!online) {
    banner.classList.remove('is-hidden');
    textEl.textContent = staleDataCachedAt
      ? t('offline.staleDataBanner', { time: formatCacheTime_(staleDataCachedAt) })
      : t('offline.banner');
    return;
  }

  if (pendingCount > 0) {
    // 有网路了，但队列还没清空（例如刚才补送到一半又失败一次，等下一次触发重试）
    banner.classList.remove('is-hidden');
    textEl.textContent = t('offline.bannerSyncing', { count: pendingCount });
    return;
  }

  banner.classList.add('is-hidden');
}

/**
 * 绑定 online/offline 事件：一恢复连线就自动补送离线队列；离线状态一变就立刻更新横幅，
 * 不用等使用者手动做任何操作才发现自己没网路
 */
function initOfflineHandling() {
  window.addEventListener('online', () => {
    updateOfflineBanner();
    flushOfflineQueue();
  });
  window.addEventListener('offline', () => {
    updateOfflineBanner();
  });
  updateOfflineBanner();
}


/* ------------------------------------------------------------
   4. 旅程切换器
   ------------------------------------------------------------ */

/**
 * 绑定旅程切换：现在有两个下拉选单会触发同一件事——header 里那个（桌面版）跟
 * 「设置」页里那个（手机版，见 #settingsTripSwitcherPanel）。不管从哪个选的，
 * 都要连带把另一个也同步过去，两边显示的值不能对不上
 */
/**
 * 实际执行「切换旅程」的动作——原本是 initTripSwitcher() 里的一个闭包，只有
 * 下拉选单的 change 事件能呼叫到；现在旅程选择改成 tripPickerModal 里点列表，
 * 拆成外层函式让 Modal 那边也能直接呼叫同一套逻辑，不用另外重写一次。
 *
 * 内容区会先短暂淡出、换上骨架屏後再淡入，给「切换了」这件事一点视觉过场——
 * 不是全屏 Logo 那种「进入 App」的仪式感（开机动画 MIN_DISPLAY_MS 高达 2 秒，
 * 一天切换十几次旅程的话完全受不了），单纯是避免文字/数字在换资料的当下
 * 一格一格硬切，看起来更像一次有意识的转场。刻意不等 loadTripData() 载入
 * 完成才淡回来：骨架屏本身就是「资料还在路上」的提示，网路慢的时候应该
 * 看到骨架屏在转，而不是让整个内容区空白卡住等资料
 * @param {string} newTripId
 */
async function switchCurrentTrip(newTripId) {
  currentTripId = newTripId;
  localStorage.setItem(STORAGE_KEY_CURRENT_TRIP, currentTripId);
  applyTripMeta_(currentTripId);
  setTripSelectValues(currentTripId);

  await fadeOutAppMain_();
  renderDashboardSkeleton();
  fadeInAppMain_();

  try {
    await loadTripData();
    // 切换成功不再跳 Toast——切换后画面本身就会显示该旅程的资料（Hero Card／消费列表／
    // 结算总览都会跟着换），这本身就是最直接的回馈，不需要再额外跳一个提示视窗
  } catch (error) {
    showToast('error', t('toast.switchFailed'), error.message);
    clearHeroCardSkeletonToEmpty_();
    renderApiErrorState(error.message);
  }
}

const APP_MAIN_FADE_MS = 150; // 淡出/淡入各半，加总落在「300ms 以内」

/**
 * 让 #appMain（当前分页的内容区，不含 header/侧栏这些「外壳」）短暂淡出，
 * 用于切换旅程这类「资料要整批换掉」的场合。尊重 prefers-reduced-motion——
 * 开启的话直接跳过，不做动画也不额外等待
 * @return {Promise<void>}
 */
function fadeOutAppMain_() {
  const contentEl = document.getElementById('appMain');
  if (!contentEl || prefersReducedMotion_()) {
    return Promise.resolve();
  }
  contentEl.classList.add('is-content-switching');
  return wait(APP_MAIN_FADE_MS);
}

/**
 * fadeOutAppMain_() 的另一半——不需要等它跑完，淡入跟後续的资料载入是
 * 两件互不阻塞的事（见 switchCurrentTrip() 的说明）
 */
function fadeInAppMain_() {
  const contentEl = document.getElementById('appMain');
  if (contentEl) {
    contentEl.classList.remove('is-content-switching');
  }
}

function initTripSwitcher() {
  const select = document.getElementById('tripSelect');
  if (select) {
    select.addEventListener('change', (event) => switchCurrentTrip(event.target.value));
  }

  document.getElementById('tripForm').addEventListener('submit', (event) => {
    event.preventDefault();
    handleTripFormSubmit();
  });
}

/**
 * 设定 header 那个下拉选单的目前选取值，并连带刷新设置页的 pill 切换器/
 * 旅程选择清单 Modal——不管是从哪里触发的切换，都呼叫这个统一同步
 * @param {string} tripId
 */
function setTripSelectValues(tripId) {
  const select = document.getElementById('tripSelect');
  if (select) {
    select.value = tripId;
  }
  renderTripPillSwitcher();
  renderTripPickerList();
}

/**
 * 依 appState.trips 渲染旅程下拉选单——只剩 header 里那个（桌面版用）还是
 * 传统下拉选单；「设置」页那份已经换成 pill 切换器 + tripPickerModal，
 * 改由 renderTripPillSwitcher() / renderTripPickerList() 各自负责
 */
function renderTripSelect() {
  const select = document.getElementById('tripSelect');
  if (select) {
    select.innerHTML = '';

    if (appState.trips.length === 0) {
      select.innerHTML = `<option value="">${escapeHtml(t('trip.noTripOption'))}</option>`;
    } else {
      appState.trips.forEach((trip) => {
        const option = document.createElement('option');
        option.value = trip.id;
        option.textContent = trip.name;
        select.appendChild(option);
      });
    }
  }

  renderTripPillSwitcher();
  renderTripPickerList();
}

/**
 * 设置页「目前旅程」切换器——目前旅程是一般文字，后面接最多 3 颗圆圈代表
 * 其他旅程（沿用既有的 avatar-stack 头像堆叠样式），每颗圆圈显示该旅程的
 * 首字母；如果其他旅程超过 3 趟，只列前 2 颗，最后一颗改显示「+N」
 * （N 是没列出来的剩余数量），不逐一撑爆整排。整个区块跟旁边的「更改」
 * 按钮点了都会开同一个 tripPickerModal，新增旅程的功能也收在那个 Modal 里，
 * 选单改变时（不管是从哪里触发的切换）都要连带更新一次
 */
const TRIP_PILL_MAX_AVATARS = 3;
const TRIP_AVATAR_COLOR_COUNT = 8;

/**
 * 依旅程 id 算出固定的颜色 class（1~8 号色轮），同一趟旅程不管重渲染几次、
 * 不管现在排第几个，拿到的颜色都一样，不会因为切换旅程而跳色
 * @param {string} tripId
 * @return {string} 例如 'trip-avatar-color-3'
 */
function getTripAvatarColorClass_(tripId) {
  let hash = 0;
  const id = String(tripId || '');
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `trip-avatar-color-${(hash % TRIP_AVATAR_COLOR_COUNT) + 1}`;
}

function renderTripPillSwitcher() {
  const nameEl = document.getElementById('tripPillCurrentName');
  const avatarsEl = document.getElementById('tripOtherAvatars');
  if (!nameEl || !avatarsEl) {
    return;
  }

  nameEl.textContent = currentTripId ? getTripName(currentTripId) : t('trip.noTripOption');

  const otherTrips = appState.trips.filter((item) => item.id !== currentTripId);
  const renderAvatar = (trip) =>
    `<span class="avatar ${getTripAvatarColorClass_(trip.id)}" title="${escapeHtml(trip.name)}">${escapeHtml(getInitials(trip.name))}</span>`;

  if (otherTrips.length === 0) {
    avatarsEl.innerHTML = '';
  } else if (otherTrips.length <= TRIP_PILL_MAX_AVATARS) {
    avatarsEl.innerHTML = otherTrips.map(renderAvatar).join('');
  } else {
    const shown = otherTrips.slice(0, TRIP_PILL_MAX_AVATARS - 1);
    const remaining = otherTrips.length - shown.length;
    avatarsEl.innerHTML = shown.map(renderAvatar).join('') + `<span class="avatar-stack-more">+${remaining}</span>`;
  }
}

/**
 * 渲染 tripPickerModal 里的旅程清单——每趟旅程一行，点名字那块直接切换，
 * 每一行都带一颗铅笔小按钮可以改名字（不限「目前这趟」，任何一行都能直接改，
 * 不用先切换过去才能改名），沿用既有的 renameTripModal，靠通用的 data-open-modal
 * 监听器处理，这里不用再重複写开 Modal 的逻辑；按钮上带 data-rename-trip-id
 * 标明「这一行要改的是哪趟」，监听器靠这个属性分辨目标，不是永远预设 currentTripId。
 * 「新增旅程」收在这个 Modal 底部，跟清单放在一起，逻辑上都是「管理我的旅程」这件事
 */
function renderTripPickerList() {
  const listEl = document.getElementById('tripPickerList');
  if (!listEl) {
    return;
  }

  if (appState.trips.length === 0) {
    listEl.innerHTML = `<p class="empty-hint">${escapeHtml(t('trip.noTripOption'))}</p>`;
    return;
  }

  // 第一个永远是目前正在看的旅程，其余照最后更新时间新到旧排（改名字／
  // 修改设定都算更新）——比原始抓回来的顺序（建立时间由旧到新）更符合
  // 「先看到目前这趟，接下来是最近异动过的那几趟」的直觉
  const currentTrip = appState.trips.find((trip) => trip.id === currentTripId);
  const otherTrips = appState.trips
    .filter((trip) => trip.id !== currentTripId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const orderedTrips = currentTrip ? [currentTrip, ...otherTrips] : otherTrips;

  listEl.innerHTML = orderedTrips.map((trip) => {
    const isActive = trip.id === currentTripId;
    return `
      <div class="trip-picker-row ${isActive ? 'is-active' : ''}">
        <button type="button" class="trip-picker-row-main" data-select-trip-id="${escapeHtml(trip.id)}">
          <span class="avatar">${escapeHtml(getInitials(trip.name))}</span>
          <span class="trip-picker-row-name">${escapeHtml(trip.name)}</span>
        </button>
        <button type="button" class="icon-btn trip-picker-edit-btn" data-open-modal="renameTripModal" data-rename-trip-id="${escapeHtml(trip.id)}" aria-label="${escapeHtml(t('renameTripModal.title'))}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;
  }).join('');
}

/**
 * 打开「选择旅程」Modal：先确保清单是最新的再开，不然如果是从旧的快取
 * 画面直接开 Modal，可能会看到切换旅程/改名之前的旧清单
 */
function openTripPickerModal() {
  renderTripPickerList();
  openModal('tripPickerModal');
}

/**
 * tripPickerModal 里的互动：点旅程名字切换、点「新增旅程」开 addTripModal——
 * 这些是清单动态产生的内容，用事件代理绑在容器上，不用每次重新渲染都重绑一次
 */
function initTripPicker() {
  const listEl = document.getElementById('tripPickerList');
  if (listEl) {
    listEl.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-select-trip-id]');
      if (!btn) {
        return;
      }
      const tripId = btn.getAttribute('data-select-trip-id');
      closeActiveModal();
      if (tripId !== currentTripId) {
        switchCurrentTrip(tripId);
      }
    });
  }

  const addBtn = document.getElementById('tripPickerAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      closeActiveModal();
      openModal('addTripModal');
    });
  }

  ['tripPillSwitcher', 'openTripPickerBtn'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', openTripPickerModal);
    }
  });
}

/**
 * 依 ID 取得旅程名称
 * @param {string} tripId 旅程 ID
 * @return {string} 旅程名称
 */
function getTripName(tripId) {
  const trip = appState.trips.find((item) => item.id === tripId);
  return trip ? trip.name : '';
}

/**
 * 「更改旅程名称」表单送出处理——跟货币设置的 saveExchangeRates_ 走同一套模式：
 * 直接 update trips 那一列（关联都是靠 trip.id，改名字不会动到任何其他资料），
 * 成功後同步更新 appState 缓存的那份名字，再重新渲染选单/标题等所有显示旅程
 * 名称的地方，不然会看到画面上还是旧名字，要等下次重新整理才会更新
 * @param {string} [targetTripId] 要改名的旅程 id；不传的话回退成 currentTripId
 *   （沿用旧行为，对应旅程标题旁边那颗改名按钮——没有指定特定目标，永远是改「目前这趟」）
 */
async function handleRenameTripFormSubmit(targetTripId) {
  const tripId = targetTripId || currentTripId;
  if (!tripId) {
    return;
  }

  const nameInput = document.getElementById('renameTripNameInput');
  const newName = nameInput.value.trim();

  if (!newName) {
    showToast('error', t('toast.pleaseEnterTripName'), '');
    return;
  }

  const submitBtn = document.getElementById('renameTripSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const { error } = await supabaseClient.from('trips').update({ name: newName }).eq('id', tripId);
    if (error) throw error;

    const tripInList = appState.trips.find((item) => item.id === tripId);
    if (tripInList) {
      tripInList.name = newName;
      tripInList.updatedAt = new Date().toISOString(); // 後端有 updated_at 触发器的话本来就会更新，
      // 这里先在本地也同步一次，改名字之後不用整个重新整理，排序就能立刻反映最新异动
    }

    closeModal_('renameTripModal');
    renderTripSelect(); // 内部会连带刷新 renderTripPillSwitcher() / renderTripPickerList()

    // 只有改的刚好是「目前正在看的这趟」才需要刷新 Dashboard 标题；改的是清单里
    // 别的旅程的话，画面上根本没在显示它的名字，不用碰 Dashboard，
    // 更不会触发 loadTripData() 或任何资料重载
    if (tripId === currentTripId) {
      renderDashboardHeader();
    }

    showToast('success', t('toast.tripRenamed'), t('toast.tripRenamedMsg', { name: newName }));
  } catch (error) {
    showToast('error', t('toast.actionFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 新增旅程表单送出处理
 */
async function handleTripFormSubmit() {
  const nameInput = document.getElementById('tripName');
  const name = nameInput.value.trim();
  const baseCurrency = document.getElementById('tripBaseCurrency').value;

  // 搭伙金库开关：勾选的话，成员名单载入完成後会立刻呼叫後端 poolTopup 登记第一笔打款
  // （这支同时兼任「开启」，第一次登记就等於开启了金库，不需要另一个 action）
  const poolToggle = document.getElementById('poolEnableToggle');
  const poolAmountInput = document.getElementById('poolPerPersonAmount');
  const poolCurrencySelect = document.getElementById('poolCurrencySelect');
  const poolEnabled = !!(poolToggle && poolToggle.checked);
  const poolPerPersonAmount = poolAmountInput ? Number(poolAmountInput.value) : 0;
  const poolCurrency = poolCurrencySelect ? poolCurrencySelect.value : '';

  if (!name) {
    showToast('error', t('toast.pleaseEnterTripName'), '');
    return;
  }
  if (poolEnabled && !(poolPerPersonAmount > 0)) {
    showToast('error', t('pool.error.invalidAmount'), '');
    return;
  }

  const submitBtn = document.getElementById('tripSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const session = getUserSession();
    const { data: newTripRows, error: createError } = await supabaseClient.rpc('create_trip', {
      _name: name,
      _base_currency: baseCurrency,
      _display_name: session ? session.displayName : ''
    });
    if (createError) throw createError;
    const newTrip = newTripRows && newTripRows[0];

    nameInput.value = '';
    if (poolToggle) poolToggle.checked = false;
    if (poolAmountInput) poolAmountInput.value = '';
    onPoolToggleChange({ checked: false });
    closeModal_('addTripModal');

    // Modal 关了之後才做的这几步（重新拉旅程清单、切换到新旅程、整批载入资料）
    // 没有别的进度指示，用骨架屏顶著；这段失败的话单独处理，不要连累前面「新增旅程」
    // 其实已经成功这件事被盖成一片错误画面
    renderDashboardSkeleton();
    try {
      // 重新载入旅程清单，并自动切换到刚建立的新旅程
      appState.trips = await fetchTrips_();
      renderTripSelect();

      currentTripId = newTrip.id;
      applyTripMeta_(currentTripId);
      localStorage.setItem(STORAGE_KEY_CURRENT_TRIP, currentTripId);
      setTripSelectValues(currentTripId);

      await loadTripData();

      // 成员名单载入後才有得分摊，这时候才真正登记第一笔打款；
      // 失败（例如网路问题）不影响旅程本身已经建立成功，只提示金库没开成，
      // 使用者还是可以之後在设置页补登记
      if (poolEnabled) {
        try {
          const { error: poolInitError } = await supabaseClient.rpc('pool_topup', {
            _trip_id: currentTripId,
            _per_person_amount: poolPerPersonAmount,
            _currency: poolCurrency
          });
          if (poolInitError) throw poolInitError;
          appState.pool = await fetchPoolStatus_();
        } catch (poolError) {
          showToast('error', t('pool.error.initFailed'), poolError.message);
        }
        renderEverything();
      }
    } catch (reloadError) {
      clearHeroCardSkeletonToEmpty_();
      renderApiErrorState(reloadError.message);
      throw reloadError;
    }
  } catch (error) {
    showToast('error', t('toast.createFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 绑定「新增旅程」Modal 里「新建旅程 / 加入旅程」两个分页的切换，以及加入旅程表单的送出
 * 邀请码就是旅程自己的 ID，向已经在这趟旅程里的同行索取即可
 */
function initJoinTripForm() {
  const createTabBtn = document.getElementById('createTripTabBtn');
  const joinTabBtn = document.getElementById('joinTripTabBtn');
  const createForm = document.getElementById('tripForm');
  const joinForm = document.getElementById('joinTripForm');

  if (createTabBtn && joinTabBtn && createForm && joinForm) {
    const setTripModalTab = (tab) => {
      const isCreate = tab === 'create';
      createTabBtn.classList.toggle('is-active', isCreate);
      joinTabBtn.classList.toggle('is-active', !isCreate);
      createForm.classList.toggle('is-hidden', !isCreate);
      joinForm.classList.toggle('is-hidden', isCreate);
      document.getElementById('tripModalFooterCreate').classList.toggle('is-hidden', !isCreate);
      document.getElementById('tripModalFooterJoin').classList.toggle('is-hidden', isCreate);
    };

    createTabBtn.addEventListener('click', () => setTripModalTab('create'));
    joinTabBtn.addEventListener('click', () => setTripModalTab('join'));
  }

  if (joinForm) {
    joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleJoinTripFormSubmit();
    });
  }

  // 跟注册表单的邀请码栏位共用同一套「认领旧成员」逻辑
  initClaimMemberPicker({
    inviteInputId: 'joinTripInviteCode',
    fieldId: 'joinTripClaimMemberField',
    selectId: 'joinTripClaimMemberSelect'
  });
}

/**
 * 加入旅程表单送出处理：用邀请码加入朋友的旅程，成功后自动切换过去
 */
async function handleJoinTripFormSubmit() {
  const codeInput = document.getElementById('joinTripInviteCode');
  const inviteCode = codeInput.value.trim();

  if (!inviteCode) {
    showToast('error', t('joinTrip.failedTitle'), '');
    return;
  }

  // 按下去马上进入 loading 状态，不要等「检查有没有旧成员可以认领」这个网路请求跑完才显示，
  // 不然中间那段时间完全没有视觉回馈，使用者会不确定自己是不是真的点到了
  const submitBtn = document.getElementById('joinTripSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const claimField = document.getElementById('joinTripClaimMemberField');
    const claimSelect = document.getElementById('joinTripClaimMemberSelect');

    // 同样的把关：确保使用者有机会看到「你是哪一位」的选项，才不会手比手快漏看
    if (claimField && claimSelect && claimSelect.dataset.checkedCode !== inviteCode) {
      await checkClaimMemberOptions(inviteCode, claimField, claimSelect);
    }

    // 已经是这趟旅程的成员了：不用送出去让後端拒绝一次，这里直接讲清楚就好
    if (claimSelect && claimSelect.dataset.alreadyMember === 'true') {
      showToast('info', t('joinTrip.failedTitle'), t('authGate.alreadyMemberNotice'));
      return;
    }

    // 只要画面上有列出「可以认领的旧成员」选项，就一定要使用者亲手选过，才让送出继续往下走——
    // 不然下拉预设停在第一个选项，使用者没注意到的话就会悄悄用「新建成员」送出
    if (claimField && claimSelect && !claimField.classList.contains('is-hidden') && claimSelect.dataset.userChosen !== 'true') {
      showToast('info', t('authGate.claimMemberReviewTitle'), t('authGate.claimMemberReviewMsg'));
      return;
    }

    const rawClaimValue = claimSelect ? claimSelect.value : '';
    const claimMemberId = (rawClaimValue && rawClaimValue !== '__unselected__') ? rawClaimValue : null;
    const session = getUserSession();

    const { data: joinedTripId, error: joinError } = await supabaseClient.rpc('join_trip_by_code', {
      _invite_code: inviteCode,
      _claim_member_id: claimMemberId,
      _display_name: session ? session.displayName : ''
    });
    if (joinError) throw joinError;

    codeInput.value = '';
    if (claimSelect) claimSelect.innerHTML = '';
    if (claimField) claimField.classList.add('is-hidden');
    closeModal_('addTripModal');

    renderDashboardSkeleton();
    try {
      appState.trips = await fetchTrips_();
      renderTripSelect();

      currentTripId = joinedTripId;
      applyTripMeta_(currentTripId);
      localStorage.setItem(STORAGE_KEY_CURRENT_TRIP, currentTripId);
      setTripSelectValues(currentTripId);

      await loadTripData();
    } catch (reloadError) {
      clearHeroCardSkeletonToEmpty_();
      renderApiErrorState(reloadError.message);
      throw reloadError;
    }
  } catch (error) {
    showToast('error', t('joinTrip.failedTitle'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 显示设置页「账户资料」面板里目前登入的 Email/Nickname，并绑定「更改」按钮的展开收合、
 * 「储存 Email」「储存 Nickname」「更改密码」
 * 登出按钮不在这里——实际放在左边导览栏（桌面版侧栏 + 手机版抽屉），见 initLogoutButtons()
 */
function initAccountPanel() {
  const session = getUserSession();

  const emailDisplayEl = document.getElementById('accountEmailDisplay');
  if (emailDisplayEl) {
    emailDisplayEl.textContent = (session && session.email) ? session.email : t('account.emailNotSet');
  }

  const displayNameDisplayEl = document.getElementById('accountDisplayNameDisplay');
  if (displayNameDisplayEl && session) {
    displayNameDisplayEl.textContent = session.displayName || '';
  }

  // 「更改」按钮：点了才展开对应的编辑表单，储存/取消之后收回去——这三个栏位平常都用不到，不用一直占位置
  initAccountEditToggle({
    rowId: 'accountEmailRow',
    editBtnId: 'editEmailBtn',
    formId: 'accountEmailForm',
    cancelBtnId: 'cancelEmailBtn',
    onOpen: () => {
      const input = document.getElementById('accountEmailInput');
      if (input) input.value = (session && session.email) ? session.email : '';
    }
  });

  initAccountEditToggle({
    rowId: 'accountDisplayNameRow',
    editBtnId: 'editDisplayNameBtn',
    formId: 'accountDisplayNameForm',
    cancelBtnId: 'cancelDisplayNameBtn',
    onOpen: () => {
      const input = document.getElementById('accountDisplayNameInput');
      if (input) input.value = (session && session.displayName) ? session.displayName : '';
    }
  });

  initAccountEditToggle({
    rowId: 'accountPasswordRow',
    editBtnId: 'editPasswordBtn',
    formId: 'accountPasswordForm',
    cancelBtnId: 'cancelPasswordBtn',
    onOpen: () => {
      const currentInput = document.getElementById('accountCurrentPasswordInput');
      const newInput = document.getElementById('accountNewPasswordInput');
      if (currentInput) currentInput.value = '';
      if (newInput) newInput.value = '';
    }
  });

  const saveEmailBtn = document.getElementById('saveEmailBtn');
  if (saveEmailBtn) {
    saveEmailBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('accountEmailInput');
      const email = emailInput.value.trim();

      setButtonLoading(saveEmailBtn, true);
      try {
        // 注意：Supabase 默认会先寄确认信到新邮箱，要点了确认连结邮箱才会真的换成新的，
        // 这段期间登入还是要用旧邮箱——这是 Supabase 的安全设计，比原本後端直接改掉更保险
        const { error } = await supabaseClient.auth.updateUser({ email });
        if (error) throw error;

        if (emailDisplayEl) {
          emailDisplayEl.textContent = email || t('account.emailNotSet');
        }

        showToast('info', t('account.emailSavedTitle'), t('account.emailSavedMsg'));
        closeAccountEditForm('accountEmailRow', 'accountEmailForm');
      } catch (error) {
        showToast('error', t('account.emailSaveFailedTitle'), error.message);
      } finally {
        setButtonLoading(saveEmailBtn, false);
      }
    });
  }

  const saveDisplayNameBtn = document.getElementById('saveDisplayNameBtn');
  if (saveDisplayNameBtn) {
    saveDisplayNameBtn.addEventListener('click', async () => {
      const displayNameInput = document.getElementById('accountDisplayNameInput');
      const displayName = displayNameInput.value.trim();

      if (!displayName) {
        showToast('error', t('account.displayNameSaveFailedTitle'), '');
        return;
      }

      setButtonLoading(saveDisplayNameBtn, true);
      try {
        const { error } = await supabaseClient.auth.updateUser({ data: { nickname: displayName } });
        if (error) throw error;

        // members.nickname 是「登记当下」存的一份快照（见 syncMembersState_ 的说明），
        // 不会自动跟着账号改名——这里把这个账号在「所有」旅程里的成员显示名称都一并同步过去
        const session = getUserSession();
        if (session) {
          await supabaseClient.from('members').update({ nickname: displayName }).eq('user_id', session.userId);
        }

        const displayNameDisplayEl = document.getElementById('accountDisplayNameDisplay');
        if (displayNameDisplayEl) {
          displayNameDisplayEl.textContent = displayName;
        }

        renderWelcomeBanner();
        closeAccountEditForm('accountDisplayNameRow', 'accountDisplayNameForm');

        // 现在这趟旅程的成员名单里，我方的显示名字也变了，重新整理一次名单相关画面
        if (currentTripId) {
          await refreshMembers();
        }
      } catch (error) {
        showToast('error', t('account.displayNameSaveFailedTitle'), error.message);
      } finally {
        setButtonLoading(saveDisplayNameBtn, false);
      }
    });
  }

  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      const currentPasswordInput = document.getElementById('accountCurrentPasswordInput');
      const newPasswordInput = document.getElementById('accountNewPasswordInput');
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;

      if (!currentPassword || !newPassword) {
        showToast('error', t('account.passwordChangeFailedTitle'), t('account.passwordFieldsRequired'));
        return;
      }

      setButtonLoading(changePasswordBtn, true);
      try {
        // Supabase 的 updateUser 不会主动要求「目前密码」（已经算登入中，本来就有权限改）；
        // 这里先用目前密码重新登入一次做验证，行为上比较贴近原本「要输入目前密码才能改」的设计，
        // 也能在真的打错目前密码时给出清楚的错误，而不是让人误以为密码已经改了
        const session = getUserSession();
        if (!session || !session.email) {
          throw new Error(t('account.sessionEmailMissing'));
        }
        const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
          email: session.email,
          password: currentPassword
        });
        if (verifyError) throw new Error(t('account.currentPasswordIncorrect'));

        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;

        currentPasswordInput.value = '';
        newPasswordInput.value = '';
        closeAccountEditForm('accountPasswordRow', 'accountPasswordForm');
      } catch (error) {
        showToast('error', t('account.passwordChangeFailedTitle'), error.message);
      } finally {
        setButtonLoading(changePasswordBtn, false);
      }
    });
  }
}

/**
 * 「账户资料」面板里共用的「点更改展开、点取消/储存后收回」逻辑
 * 展开时显示行（行内容 + 更改按钮）会藏起来，只留下编辑表单；收回时反过来
 * @param {{rowId: string, editBtnId: string, formId: string, cancelBtnId: string, onOpen: Function}} config
 */
function initAccountEditToggle(config) {
  const row = document.getElementById(config.rowId);
  const editBtn = document.getElementById(config.editBtnId);
  const form = document.getElementById(config.formId);
  const cancelBtn = document.getElementById(config.cancelBtnId);

  if (!row || !editBtn || !form) return;

  editBtn.addEventListener('click', () => {
    if (config.onOpen) config.onOpen();
    row.classList.add('is-hidden');
    form.classList.remove('is-hidden');
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeAccountEditForm(config.rowId, config.formId);
    });
  }
}

/**
 * 收回某一个「账户资料」编辑表单，换回原本的显示行 + 更改按钮
 */
function closeAccountEditForm(rowId, formId) {
  const row = document.getElementById(rowId);
  const form = document.getElementById(formId);
  if (form) form.classList.add('is-hidden');
  if (row) row.classList.remove('is-hidden');
}

/**
 * 登出：先让整个 App 主体缩小、模糊、淡出，再清掉 Session、重新整理页面——
 * 之所以还是靠 reload 收尾（不是纯粹前端切换回登入画面），是为了确保上一个账号
 * 留在记忆体里的所有资料（appState、currentTripId……）都被彻底清空，不会不小心
 * 露出到下一个登入的账号；只是补一个动画，让这个瞬间不要那么突兀。
 * setTimeout 的时间刻意抓得比 CSS transition（0.45s）长一点，确保动画播完才 reload，
 * 不然动画会被硬生生截断，等于没有动画
 */
function initLogoutButtons() {
  const doLogout = () => {
    const appShell = document.getElementById('appShell');
    if (appShell) {
      appShell.classList.add('is-logging-out');
      setTimeout(async () => {
        await clearUserSession();
        window.location.reload();
      }, 480);
    } else {
      clearUserSession().then(() => window.location.reload());
    }
  };

  const sidebarBtn = document.getElementById('sidebarLogoutBtn');
  if (sidebarBtn) {
    sidebarBtn.addEventListener('click', doLogout);
  }

  const drawerBtn = document.getElementById('drawerLogoutBtn');
  if (drawerBtn) {
    drawerBtn.addEventListener('click', doLogout);
  }

  const settingsBtn = document.getElementById('settingsLogoutBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', doLogout);
  }
}

/**
 * 绑定设置页「语言」面板里的「更改」按钮：打开跟侧栏语言按钮同一个语言选择清单，
 * 纯粹是为了手机版碰不到侧栏而补的另一个入口
 */
function initSettingsLanguageToggle() {
  const button = document.getElementById('settingsLangToggleBtn');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    renderLanguagePickerList();
    openModal('languagePickerModal');
  });
}

/**
 * 渲染语言选择 Modal 里的选项清单，依 SUPPORTED_LANGUAGES 动态产生——加新语言只要
 * 在那份清单加一笔，这里不用改。目前作用中的语言会打勾，点其他选项立刻切换语言、
 * 记住选择、关闭 Modal
 */
function renderLanguagePickerList() {
  const container = document.getElementById('languagePickerList');
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="language-option-list">
      ${SUPPORTED_LANGUAGES.map((lang) => `
        <button type="button" class="language-option${lang.code === currentLang ? ' is-active' : ''}" data-lang-code="${escapeHtml(lang.code)}">
          <span>${escapeHtml(lang.nativeLabel)}</span>
          <svg class="language-option-check" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5L10 17.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('[data-lang-code]').forEach((button) => {
    button.addEventListener('click', () => {
      selectLanguage(button.getAttribute('data-lang-code'));
    });
  });
}

/**
 * 套用指定语言：记住选择、套用翻译。导览的一键循环按钮、设置页清单选择都共用这支函式，
 * 差别只在清单选择完还要多关闭 Modal（见 selectLanguage）
 * 选到目前已经在用的语言也没关系，一样安全地重新套用一次。
 *
 * applyLanguage() 会重绘几乎所有动态文字（导览、标题、清单、卡片……），
 * 直接呼叫的话中间那一帧会明显闪一下（旧语言消失、新语言还没画出来的空档）。
 * 這裡加一个整体淡出→重绘→淡入的过场盖掉那一帧——只对 App 主体（#appShell）
 * 生效：登入页切语言（authGate 还开着、#appShell 还是 is-hidden 的时候）
 * 不加任何过场，登入之前没有「进入 App」这个语境，
 * 遮挡也没有对象可以遮
 * @param {string} code 语言代码，必须存在于 SUPPORTED_LANGUAGES
 */
async function setLanguage(code) {
  if (!SUPPORTED_LANGUAGES.some((lang) => lang.code === code)) {
    return;
  }

  currentLang = code;
  localStorage.setItem(STORAGE_KEY_LANG, currentLang);

  const appShellEl = document.getElementById('appShell');
  const shouldFade = appShellEl && !appShellEl.classList.contains('is-hidden') && !prefersReducedMotion_();

  if (!shouldFade) {
    applyLanguage();
    return;
  }

  appShellEl.classList.add('is-lang-switching', 'is-lang-switching-hidden');
  await wait(LANG_SWITCH_FADE_MS);
  applyLanguage();
  appShellEl.classList.remove('is-lang-switching-hidden');
  // 淡入跑完後再把 is-lang-switching 拿掉，恢复 .app-shell 原本给「登出」动画用
  // 的那份较长过渡时间——这段时间内 opacity 已经在 1，不会有额外的視覺变化
  window.setTimeout(() => appShellEl.classList.remove('is-lang-switching'), LANG_SWITCH_FADE_MS);
}

const LANG_SWITCH_FADE_MS = 100; // 淡出/淡入各半，加总落在「约 200ms」

/**
 * 套用使用者在语言选择 Modal 里选的语言：记住选择、套用翻译、关闭 Modal。
 * @param {string} code 语言代码，必须存在于 SUPPORTED_LANGUAGES
 */
function selectLanguage(code) {
  setLanguage(code);
  closeActiveModal();
}


/* ------------------------------------------------------------
   5. 资料载入与整体刷新（皆围绕目前选定的旅程）
   ------------------------------------------------------------ */

/**
 * 载入目前旅程的所有资料（成员、分类、消费、结算总览），并渲染所有页面
 */
/**
 * 向 Supabase 撈取「这趟旅程」的成员名单，并同步到 appState 相关栏位：
 * - appState.members：跟旧版一样，是一份「目前该显示的名字」字串阵列（不是 id），
 *   这样消费表单、结算总览等还没改写的地方可以继续沿用，不用大改
 * - appState.memberIndex：新增的，name <-> id 对照表，5.5（消费）之後转换要用
 * - appState.viewerName／appState.unclaimedMembers：跟旧版语意相同
 */
async function syncMembersState_() {
  const { data, error } = await supabaseClient
    .from('members')
    .select('id, name, nickname, user_id, created_at')
    .eq('trip_id', currentTripId);
  if (error) throw error;

  const rows = data || [];
  const displayNameOf = (row) => row.nickname || row.name;
  const session = getUserSession();

  const memberIndex = { byName: {}, byId: {} };
  const memberJoinedAt = {};
  rows.forEach((row) => {
    const displayName = displayNameOf(row);
    memberIndex.byName[displayName] = row.id;
    memberIndex.byId[row.id] = displayName;
    memberJoinedAt[displayName] = row.created_at;
  });

  const viewerRow = session ? rows.find((row) => row.user_id === session.userId) : null;

  appState.members = sortMembersAlphabetically(rows.map(displayNameOf));
  appState.memberIndex = memberIndex;
  // 每位成员是「什麼时候加入这趟旅程的」——金库份摊要用这个排除掉「加入之前」发生的
  // 支出/打款/退款，不能让新成员被算到他还没加入时的旧账上（见 computeMemberPoolShares_）
  appState.memberJoinedAt = memberJoinedAt;
  appState.viewerName = viewerRow ? displayNameOf(viewerRow) : '';
  appState.unclaimedMembers = rows
    .filter((row) => !row.user_id)
    .map((row) => ({ memberId: row.id, name: row.name }));
}

/**
 * 取得目前这趟旅程看得到的分类清单——系统内置（trip_id is null）+ 这趟旅程
 * 自己加的自定义分类。RLS 已经保证「只会撈到系统内置 + 自己有加入的行程」，
 * 但一个人可能同时是好几趟旅程的成员，这里还要再用 trip_id 明确限定在
 * 「目前这趟」，不然会把其他趟旅程的自定义分类也混进来。
 *
 * 系统内置分类固定排在最前面（维持 CATEGORY_ICON_META 里原本的顺序），
 * 自定义分类接在後面按建立时间排序——理由见 migration 里 created_at
 * 欄位的注释，这里不做拖拽排序
 * @return {Array<{id: string, name: string, tripId: string|null, isHidden: boolean, icon: string|null}>}
 */
async function fetchCategories_() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, trip_id, created_by, icon, is_hidden, created_at')
    .or(`trip_id.is.null,trip_id.eq.${currentTripId}`);
  if (error) throw error;

  const rows = (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    tripId: row.trip_id,
    createdBy: row.created_by,
    icon: row.icon,
    isHidden: row.is_hidden,
    createdAt: row.created_at
  }));

  const builtins = rows.filter((row) => !row.tripId);
  const custom = rows
    .filter((row) => row.tripId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 系统内置分类固定顺序沿用 CATEGORY_ICON_META 的 key 顺序，不是資料库
  // 撈回来的顺序（撈回来的顺序不保证跟这里一致）
  const builtinOrder = Object.keys(CATEGORY_ICON_META);
  builtins.sort((a, b) => builtinOrder.indexOf(a.name) - builtinOrder.indexOf(b.name));

  return [...builtins, ...custom];
}


/* ------------------------------------------------------------
   5.5 消费记录与结算计算（原本在 Code.gs 的算钱逻辑，搬到前端来跑）
   ------------------------------------------------------------
   资料库里的 payer_member_id / participants / custom_split 存的都是成员 id（uuid），
   但整个前端渲染／表单一直以来都是用「名字字串」在操作（appState.members 是名字阵列）。
   为了不用大改渲染那几千行代码，读取时统一在这里把 id 转换成「目前该显示的名字」，
   写入时再转换回 id——appState.memberIndex（见 syncMembersState_）就是这份对照表。
   ------------------------------------------------------------ */

const AMOUNT_DECIMAL_PLACES_ = 2;

/**
 * 金额四舍五入到 2 位小数，刻意维持固定的逻辑，不要贸然调整
 * @param {number} amount
 * @return {number}
 */
function roundAmount_(amount) {
  const factor = Math.pow(10, AMOUNT_DECIMAL_PLACES_);
  let nudged = amount * factor;
  nudged = nudged >= 0 ? nudged + Number.EPSILON * Math.abs(nudged) : nudged - Number.EPSILON * Math.abs(nudged);
  return Math.round(nudged) / factor;
}

function calculateEqualSplit_(amount, participants) {
  const result = {};
  const count = participants.length;
  const baseShare = roundAmount_(amount / count);
  let accumulated = 0;

  for (let i = 0; i < count - 1; i++) {
    result[participants[i]] = baseShare;
    accumulated += baseShare;
  }
  result[participants[count - 1]] = roundAmount_(amount - accumulated);
  return result;
}

function calculateCustomSplit_(customSplit) {
  const result = {};
  Object.keys(customSplit || {}).forEach((name) => {
    result[name] = roundAmount_(parseFloat(customSplit[name]));
  });
  return result;
}

function calculatePercentageSplit_(amount, percentageMap) {
  const names = Object.keys(percentageMap);
  const result = {};
  let accumulated = 0;

  for (let i = 0; i < names.length - 1; i++) {
    const share = roundAmount_(amount * (parseFloat(percentageMap[names[i]]) / 100));
    result[names[i]] = share;
    accumulated += share;
  }
  const lastName = names[names.length - 1];
  result[lastName] = roundAmount_(amount - accumulated);
  return result;
}

function calculateSharesSplit_(amount, sharesMap) {
  const names = Object.keys(sharesMap);
  const totalShares = names.reduce((sum, name) => sum + (parseFloat(sharesMap[name]) || 0), 0);
  const result = {};

  if (totalShares <= 0) {
    names.forEach((name) => { result[name] = 0; });
    return result;
  }

  let accumulated = 0;
  for (let i = 0; i < names.length - 1; i++) {
    const shareCount = parseFloat(sharesMap[names[i]]) || 0;
    const share = roundAmount_(amount * (shareCount / totalShares));
    result[names[i]] = share;
    accumulated += share;
  }
  const lastName = names[names.length - 1];
  result[lastName] = roundAmount_(amount - accumulated);
  return result;
}

function calculateExpenseSplit_(expense) {
  switch (expense.SplitType) {
    case 'custom':
      return calculateCustomSplit_(expense.CustomSplit);
    case 'percentage':
      return calculatePercentageSplit_(expense.Amount, expense.CustomSplit);
    case 'shares':
      return calculateSharesSplit_(expense.Amount, expense.CustomSplit);
    case 'pool':
      return {};
    default:
      return calculateEqualSplit_(expense.Amount, expense.Participants);
  }
}

/**
 * 把金额从原始货币换算成旅程的基准货币：优先用这笔消费自己的历史汇率快照，
 * 没有的话 fallback 用旅程「目前」的汇率，两者都没有就当作 1:1（不换算）
 */
function convertToBaseCurrency_(amount, currency, tripCurrency, snapshotRate) {
  let rate = snapshotRate;
  if (rate === undefined || rate === null || isNaN(rate) || rate <= 0) {
    rate = tripCurrency.rates[currency];
  }
  if (rate === undefined || rate === null || isNaN(rate) || rate <= 0) {
    rate = 1;
  }
  return roundAmount_(amount * rate);
}

/**
 * 最少交易结算演算法（贪婪法：每次让最大债权人与最大债务人互相抵销），
 * 刻意维持这套演算法，不要贸然调整
 */
function settlementAlgorithm_(balanceMap) {
  const creditors = [];
  const debtors = [];

  Object.keys(balanceMap).forEach((name) => {
    const balance = balanceMap[name];
    if (balance > AMOUNT_TOLERANCE) {
      creditors.push({ name, amount: balance });
    } else if (balance < -AMOUNT_TOLERANCE) {
      debtors.push({ name, amount: -balance });
    }
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const settleAmount = roundAmount_(Math.min(creditor.amount, debtor.amount));

    if (settleAmount > AMOUNT_TOLERANCE) {
      settlements.push({ from: debtor.name, to: creditor.name, amount: settleAmount });
    }

    creditor.amount = roundAmount_(creditor.amount - settleAmount);
    debtor.amount = roundAmount_(debtor.amount - settleAmount);

    if (creditor.amount <= AMOUNT_TOLERANCE) ci++;
    if (debtor.amount <= AMOUNT_TOLERANCE) di++;
  }

  return settlements;
}

/**
 * 计算结算总览（balances + settlements），完全在前端算，不用再打後端
 * 直接读 appState.members / appState.expenses / appState.repayments / appState.tripCurrency
 *
 * ⚠️ 身份识别一律用 member id（PayerId／ParticipantIds／CustomSplitById／
 * FromMemberId／ToMemberId），只有在组出最终 balances 阵列的那一刻，才用
 * 「目前」的 memberIndex.byId 转换成显示名字——这样不管是不是有人刚改过昵称、
 * 认领过成员，这里算出来的钱一定是对的人，不会因为名字字串没同步更新而算错
 */
function computeSummaryClient_() {
  const idToName = (appState.memberIndex && appState.memberIndex.byId) || {};
  const memberIds = Object.keys(idToName);

  const paidMapById = {};
  const shouldPayMapById = {};
  memberIds.forEach((id) => { paidMapById[id] = 0; shouldPayMapById[id] = 0; });

  appState.expenses.forEach((expense) => {
    if (expense.Deleted || expense.SplitType === 'pool') {
      return;
    }

    const convertedAmount = convertToBaseCurrency_(expense.Amount, expense.Currency, appState.tripCurrency, expense.ExchangeRateSnapshot);
    if (expense.PayerId) {
      paidMapById[expense.PayerId] = roundAmount_((paidMapById[expense.PayerId] || 0) + convertedAmount);
    }

    // calculateExpenseSplit_ 本身不在乎 key 是名字还是 id，只是照原样分配比例，
    // 这里直接喂 id 版本的 Participants／CustomSplit 进去，拿回来的就是 id -> 金额
    const splitResultById = calculateExpenseSplit_({
      SplitType: expense.SplitType,
      Amount: expense.Amount,
      Participants: expense.ParticipantIds || [],
      CustomSplit: expense.CustomSplitById || {}
    });
    Object.keys(splitResultById).forEach((id) => {
      const convertedShare = convertToBaseCurrency_(splitResultById[id], expense.Currency, appState.tripCurrency, expense.ExchangeRateSnapshot);
      shouldPayMapById[id] = roundAmount_((shouldPayMapById[id] || 0) + convertedShare);
    });
  });

  const balanceMapById = {};
  memberIds.forEach((id) => {
    balanceMapById[id] = roundAmount_((paidMapById[id] || 0) - (shouldPayMapById[id] || 0));
  });

  const repaidTotalById = {};
  const receivedTotalById = {};
  memberIds.forEach((id) => { repaidTotalById[id] = 0; receivedTotalById[id] = 0; });

  (appState.repayments || []).forEach((repayment) => {
    const fromId = repayment.FromMemberId;
    const toId = repayment.ToMemberId;
    if (fromId && balanceMapById.hasOwnProperty(fromId)) {
      balanceMapById[fromId] = roundAmount_(balanceMapById[fromId] + repayment.Amount);
      repaidTotalById[fromId] = roundAmount_(repaidTotalById[fromId] + repayment.Amount);
    }
    if (toId && balanceMapById.hasOwnProperty(toId)) {
      balanceMapById[toId] = roundAmount_(balanceMapById[toId] - repayment.Amount);
      receivedTotalById[toId] = roundAmount_(receivedTotalById[toId] + repayment.Amount);
    }
  });

  // 到这里才第一次、也是唯一一次转换成显示名字——settlementAlgorithm_ 跟渲染层
  // 沿用既有设计继续吃「名字」，但这份名字保证是当下最新的，不会有过期问题
  const balances = memberIds.map((id) => ({
    name: idToName[id],
    paid: paidMapById[id] || 0,
    shouldPay: shouldPayMapById[id] || 0,
    balance: balanceMapById[id] || 0,
    repaid: repaidTotalById[id] || 0,
    received: receivedTotalById[id] || 0
  }));

  const balanceMapByName = {};
  balances.forEach((item) => { balanceMapByName[item.name] = item.balance; });

  return {
    balances,
    settlements: settlementAlgorithm_(balanceMapByName),
    baseCurrency: appState.tripCurrency.baseCurrency
  };
}

/**
 * 依分类＋货币计算每一组的消费总额（账目页的分类统计用）
 */
function computeCategorySummaryClient_() {
  const totalsByKey = {};

  appState.expenses.forEach((expense) => {
    if (expense.Deleted) return;
    const category = expense.Category || 'Others';
    const currency = expense.Currency || 'MYR';
    const key = category + '::' + currency;

    if (!totalsByKey[key]) {
      totalsByKey[key] = { category, currency, total: 0, count: 0 };
    }
    totalsByKey[key].total = roundAmount_(totalsByKey[key].total + expense.Amount);
    totalsByKey[key].count += 1;
  });

  return Object.values(totalsByKey).sort((a, b) => b.total - a.total);
}

/**
 * 取得某一笔金库支出「当时」的人均分摊金额——用建立当下的人数快照，不是现在的人数。
 * 没有快照（这个栏位加进来之前记的旧资料）就 fallback 用现在的人数
 * @param {Object} expense 消费物件（SplitType==='pool' 的那种）
 * @return {number}
 */
function getPoolDeductShareAmount_(expense) {
  const pool = appState.pool;
  const currentMemberCount = appState.members.length || 1;
  const tx = ((pool && pool.transactions) || []).find((item) => item.type === 'deduct' && item.expenseId === expense.ID);
  const snapshot = (tx && tx.memberCountSnapshot) || currentMemberCount;
  return Number(expense.Amount) / (snapshot || 1);
}

/**
 * 计算「某位成员」在搭伙金库里的三块份额：登记打款的「已付」、支出的「个人消费」、
 * 结程退余的「已收」——只算这位成员「加入这趟旅程之後」发生的交易，不会把他加入
 * 之前的旧账算到他头上（新成员不该分摊到加入前就花掉的金库支出）。
 * Hero Card、成员详情页、个人 PDF、整体 PDF 报告，四个用到金库份摊的地方都共用
 * 这个函式，之後真要调整算法，只要改这一处，不会散落四份各自算、彼此对不上
 * @param {string} name 成员显示名称
 * @return {{topupBreakdown: Array, consumptionBreakdown: Array, refundBreakdown: Array, poolDeductExpenses: Array}}
 *   前三个都是 [{currency, total}] 格式，可以直接丢给 buildMixedCurrencyBreakdown／
 *   formatCurrencyBreakdownText 用；poolDeductExpenses 是这位成员加入後的金库支出清单，
 *   逐笔列表要用
 */
function computeMemberPoolShares_(name) {
  const pool = appState.pool;
  const joinedAt = appState.memberJoinedAt ? appState.memberJoinedAt[name] : null;
  const currentMemberCount = appState.members.length || 1;
  const isAfterJoining = (createdAt) => !joinedAt || new Date(createdAt) >= new Date(joinedAt);
  const baseCurrency = (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR';

  const toBreakdownArray = (totalsByCurrency) => Object.keys(totalsByCurrency)
    .map((currency) => ({ currency, total: roundAmount_(totalsByCurrency[currency]) }))
    .sort((a, b) => (a.currency === baseCurrency ? -1 : b.currency === baseCurrency ? 1 : a.currency.localeCompare(b.currency)));

  const topupTotals = {};
  const filteredTopups = ((pool && pool.topups) || []).filter((topup) => isAfterJoining(topup.createdAt));
  filteredTopups.forEach((topup) => {
    topupTotals[topup.currency] = (topupTotals[topup.currency] || 0) + topup.perPersonAmount;
  });

  const poolDeductExpenses = appState.expenses
    .filter((expense) => expense.SplitType === 'pool' && expense.Payer === POOL_EXPENSE_PAYER_SENTINEL)
    .filter((expense) => isAfterJoining(expense.CreatedAt));

  const consumptionTotals = {};
  poolDeductExpenses.forEach((expense) => {
    const share = getPoolDeductShareAmount_(expense);
    consumptionTotals[expense.Currency] = (consumptionTotals[expense.Currency] || 0) + share;
  });

  // 「已收」除了结程退余（refund），也包含金库消费在结算後被删除、均分退回给
  // 每位成员的「消费退款」（expense_refund）——两种对成员来说都是「从金库收到钱」
  const refundTotals = {};
  const filteredRefundTxs = ((pool && pool.transactions) || [])
    .filter((tx) => (tx.type === 'refund' || tx.type === 'expense_refund') && isAfterJoining(tx.createdAt));
  filteredRefundTxs.forEach((tx) => {
    const snapshot = tx.memberCountSnapshot || currentMemberCount;
    const share = tx.amount / (snapshot || 1);
    refundTotals[tx.currency] = (refundTotals[tx.currency] || 0) + share;
  });

  return {
    topupBreakdown: toBreakdownArray(topupTotals),
    consumptionBreakdown: toBreakdownArray(consumptionTotals),
    refundBreakdown: toBreakdownArray(refundTotals),
    poolTopups: filteredTopups,
    poolDeductExpenses,
    poolRefundTxs: filteredRefundTxs
  };
}

/**
 * 把 custom_split 的 key（member id）换成「目前该显示的名字」
 */
function mapCustomSplitIdsToNames_(customSplit, idToName) {
  const result = {};
  Object.keys(customSplit || {}).forEach((id) => {
    const name = idToName[id];
    if (name) result[name] = customSplit[id];
  });
  return result;
}

/**
 * 把 custom_split 的 key（名字）换成 member id，供写入资料库用
 */
function mapCustomSplitNamesToIds_(customSplit, nameToId) {
  const result = {};
  Object.keys(customSplit || {}).forEach((name) => {
    const id = nameToId[name];
    if (id) result[id] = customSplit[name];
  });
  return result;
}

/**
 * 把 Supabase expenses 表的一列资料，转换成前端一直在用的「消费物件」形状
 * （TripID/ID/Date/Payer(名字)/Participants(名字阵列)/CustomSplit(名字 key)/CanManage...），
 * 这样渲染／结算计算那些既有代码完全不用改
 */
function expenseRowToOldShape_(row) {
  const idToName = (appState.memberIndex && appState.memberIndex.byId) || {};
  const session = getUserSession();

  return {
    TripID: row.trip_id,
    ID: row.id,
    Date: row.date,
    CreatedAt: row.created_at,
    Payer: row.is_pool_expense ? POOL_EXPENSE_PAYER_SENTINEL : (idToName[row.payer_member_id] || ''),
    // ⚠️ 身份识别用 PayerId／ParticipantIds／CustomSplitById，不要用上面 Payer／
    // Participants／CustomSplit 这几个「名字版」去判断「这是不是同一个人」——
    // 名字会随着改昵称变动，同一次网页会话（session）里没有重新整理过的话就可能
    // 对不上目前的成员名单。Payer／Participants／CustomSplit 只用来直接显示文字。
    PayerId: row.is_pool_expense ? null : (row.payer_member_id || null),
    Amount: Number(row.amount) || 0,
    Currency: row.currency,
    Category: row.category,
    Description: row.description || '',
    SplitType: row.split_type,
    Participants: (row.participants || []).map((id) => idToName[id]).filter(Boolean),
    ParticipantIds: row.participants || [],
    CustomSplit: mapCustomSplitIdsToNames_(row.custom_split, idToName),
    CustomSplitById: row.custom_split || {},
    Receipt: row.receipt_url || '',
    Remark: row.remark || '',
    Deleted: !!row.deleted,
    Scope: row.scope || 'group',
    // 金库支出以前完全不给编辑/删除（split_type!=='pool' 这个排除条件），阶段 11
    // 拿掉了——现在权限规则统一跟其他消费一样（本人记的，或旅程建立者），删除/
    // 编辑金库支出会连带处理金库余额的多退少补，见 handleDeleteExpenseClick()／
    // handlePoolFundedExpenseEditSubmit_() 呼叫的 pool_expense_delete／
    // pool_expense_update 这两个後端函式
    CanManage: !row.created_by || (session && row.created_by === session.userId) || appState.canDeleteTrip,
    ExchangeRateSnapshot: Number(row.exchange_rate_snapshot) || 0
  };
}

/**
 * 把消费表单送出的 payload（payer/participants/customSplit 都是名字）转换成
 * 要写进 Supabase 的资料列（都换成 member id）
 */
function translateExpensePayloadForWrite_(payload) {
  const nameToId = (appState.memberIndex && appState.memberIndex.byName) || {};
  const session = getUserSession();

  return {
    trip_id: currentTripId,
    date: payload.date,
    payer_member_id: nameToId[payload.payer] || null,
    is_pool_expense: false,
    amount: roundAmount_(payload.amount),
    currency: payload.currency,
    category: payload.category,
    description: payload.description || '',
    split_type: payload.splitType,
    participants: (payload.participants || []).map((name) => nameToId[name]).filter(Boolean),
    custom_split: mapCustomSplitNamesToIds_(payload.customSplit, nameToId),
    receipt_url: payload.receipt || '',
    remark: payload.remark || '',
    scope: payload.scope || 'group', // 之後才会真的做出让使用者选 'personal' 的 UI，
    // 这里先接好，现有表单没带这个欄位时预设 'group'，行为跟改动前完全一样
    created_by: session ? session.userId : null
  };
}

/**
 * 把一批消费依 scope 分成两组——'group' 进一般结算/账目页会用的那个阵列，
 * 'personal' 进个人专属的那个阵列。这是整个「个人消费」设计的核心：只在
 * 「资料从後端进来」这个单一入口做一次分流，appState.expenses 里根本不会
 * 出现 personal 的资料，下游几千行渲染/结算计算代码天然不可能碰到、更不
 * 可能污染结算，不需要在每个消费的地方加 if (scope==='group') 这种散落
 * 各处、容易漏掉的过滤条件
 * @param {Array<Object>} rows expenseRowToOldShape_() 转换後的消费物件阵列
 * @return {{group: Array<Object>, personal: Array<Object>}}
 */
function splitExpensesByScope_(rows) {
  const group = [];
  const personal = [];
  (rows || []).forEach((expense) => {
    if (expense.Scope === 'personal') {
      personal.push(expense);
    } else {
      group.push(expense);
    }
  });
  return { group, personal };
}

/**
 * 撈取这趟旅程所有未删除的消费纪录（依日期新到旧排序）——回传的是「一般 +
 * 个人」混在一起的原始清单，呼叫端要自己用 splitExpensesByScope_() 分流，
 * 不要直接整批塞进 appState.expenses
 */
async function fetchExpenses_() {
  const { data, error } = await supabaseClient
    .from('expenses')
    .select('*')
    .eq('trip_id', currentTripId)
    .eq('deleted', false)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(expenseRowToOldShape_);
}


/* ------------------------------------------------------------
   5.6 还款记录（Repayments）
   ------------------------------------------------------------ */

/**
 * 把 Supabase repayments 表的一列资料，转换成前端一直在用的「还款物件」形状
 */
function repaymentRowToOldShape_(row) {
  const idToName = (appState.memberIndex && appState.memberIndex.byId) || {};
  const session = getUserSession();
  const toMemberName = idToName[row.to_member_id] || '';
  const viewerName = getViewerName();

  return {
    ID: row.id,
    TripID: row.trip_id,
    FromMember: idToName[row.from_member_id] || '',
    ToMember: toMemberName,
    // ⚠️ 同上：身份识别用 FromMemberId／ToMemberId，FromMember／ToMember 只用来显示文字
    FromMemberId: row.from_member_id || null,
    ToMemberId: row.to_member_id || null,
    Amount: Number(row.amount) || 0,
    Date: row.date,
    CreatedAt: row.created_at,
    Remark: row.remark || '',
    Deleted: !!row.deleted,
    // 记录建立者／旅程建立者以外，收款人自己也能编辑/删除——不然万一有人乱记一笔
    // 假还款，真正的收款人自己没辙去更正，只能拜托记录建立者或旅程建立者代劳。
    // 判断「我是不是收款人」沿用 viewerName 这个既有的名字比对方式（跟
    // renderSettlementList 等处「我是不是这笔的当事人」判断同一套逻辑），
    // 不是这里独创的新做法。後端 RLS 的 update 权限也要同步放宽，见对应 migration
    CanManage: !row.created_by || (session && row.created_by === session.userId) || appState.canDeleteTrip ||
      (!!viewerName && toMemberName === viewerName)
  };
}

/**
 * 把还款表单送出的 payload（fromMember/toMember 是名字）转换成要写进 Supabase 的资料列
 */
function translateRepaymentPayloadForWrite_(payload) {
  const nameToId = (appState.memberIndex && appState.memberIndex.byName) || {};
  const session = getUserSession();
  const row = {
    trip_id: currentTripId,
    from_member_id: nameToId[payload.fromMember] || null,
    to_member_id: nameToId[payload.toMember] || null,
    amount: roundAmount_(payload.amount),
    remark: payload.remark || ''
  };
  if (payload.date) {
    row.date = payload.date;
  }
  if (payload.isNew) {
    row.created_by = session ? session.userId : null;
  }
  return row;
}

/**
 * 撈取这趟旅程所有未删除的还款纪录（依日期由旧到新排序）
 */
async function fetchRepayments_() {
  const { data, error } = await supabaseClient
    .from('repayments')
    .select('*')
    .eq('trip_id', currentTripId)
    .eq('deleted', false)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data || []).map(repaymentRowToOldShape_);
}


/* ------------------------------------------------------------
   5.7 汇率
   ------------------------------------------------------------
   即时汇率原本是後端呼叫 Wise 的一个非官方端点代为查询（避免浏览器直接呼叫外部
   网站时的跨网域限制）。现在没有自己的後端了，改成浏览器直接呼叫 Frankfurter
   （https://frankfurter.dev，欧洲央行公开汇率数据、免费、不用申请金钥，
   而且允许网页直接跨网域呼叫），涵盖 MYR/SGD/USD/THB/IDR 等大部分常用货币。
   ------------------------------------------------------------ */

/**
 * 查询即时汇率（source 换算成 target 的汇率）
 * 服务商：Frankfurter（https://frankfurter.dev），2026 年中改了新网域 api.frankfurter.dev，
 * 旧的 api.frankfurter.app 已经停用，用这个新的
 */
async function fetchLiveRate_(source, target) {
  const src = String(source || '').trim().toUpperCase();
  const tgt = String(target || '').trim().toUpperCase();

  if (!src || !tgt) {
    throw new Error(t('toast.rateMissingParams'));
  }
  if (src === tgt) {
    return { rate: 1, source: src, target: tgt, fetchedAt: new Date().toISOString() };
  }

  let response;
  try {
    response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(src)}/${encodeURIComponent(tgt)}`);
  } catch (error) {
    throw new Error(t('toast.rateConnectionFailed'));
  }

  if (!response.ok) {
    throw new Error(t('toast.rateBadResponse', { status: response.status }));
  }

  const data = await response.json();
  const rate = data && data.rate;

  if (!rate || isNaN(rate) || rate <= 0) {
    throw new Error(t('toast.rateUnsupportedPair', { source: src, target: tgt }));
  }

  return { rate, source: src, target: tgt, fetchedAt: new Date().toISOString() };
}

/**
 * 撈取这趟旅程目前的基准货币与所有已设定的汇率
 */
async function fetchTripCurrency_() {
  const [tripResult, rateResult] = await Promise.all([
    supabaseClient.from('trips').select('base_currency').eq('id', currentTripId).single(),
    supabaseClient.from('exchange_rates').select('currency, rate_to_base, updated_at').eq('trip_id', currentTripId)
  ]);
  if (tripResult.error) throw tripResult.error;
  if (rateResult.error) throw rateResult.error;

  return normalizeCurrencyInfo({
    baseCurrency: tripResult.data.base_currency,
    rates: (rateResult.data || []).map((row) => ({
      currency: row.currency,
      rateToBase: row.rate_to_base,
      updatedAt: row.updated_at
    }))
  });
}

/**
 * 更新旅程的基准货币（选填）与一批汇率设定（覆写式：新增或更新，不会清掉没传入的旧汇率）
 * @param {{baseCurrency?: string, rates?: Object}} payload rates 格式 { "USD": 4.7, "TWD": 0.15 }
 * @return {Promise<Object>} 更新後的货币资讯，同 fetchTripCurrency_
 */
async function saveExchangeRates_(payload) {
  if (payload.baseCurrency) {
    const normalized = String(payload.baseCurrency).trim().toUpperCase();
    const { error } = await supabaseClient.from('trips').update({ base_currency: normalized }).eq('id', currentTripId);
    if (error) throw error;

    // 旅程清单里缓存的那份基准货币也要跟着同步，不然旅程切换器等地方会显示旧值
    const tripInList = appState.trips.find((item) => item.id === currentTripId);
    if (tripInList) tripInList.baseCurrency = normalized;
  }

  if (payload.rates && Object.keys(payload.rates).length > 0) {
    const rows = Object.keys(payload.rates).map((currency) => ({
      trip_id: currentTripId,
      currency: String(currency).trim().toUpperCase(),
      rate_to_base: payload.rates[currency],
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabaseClient.from('exchange_rates').upsert(rows, { onConflict: 'trip_id,currency' });
    if (error) throw error;
  }

  return fetchTripCurrency_();
}


/* ------------------------------------------------------------
   5.7 搭伙金库（Divvy Pool）
   ------------------------------------------------------------
   实际的「登记打款/扣款/结算」写入都改用 SQL 数据库函数（pool_topup 等），
   因为要先检查余额够不够、权限对不对，写入的当下就得先算好这些，
   放在数据库那一端算才不会有两个人几乎同时操作、互相踩到的问题。
   这里的 fetchPoolStatus_ 则是「读」的部分：把登记打款、支出流水两张表的原始资料
   抓回来，在前端即时加总成金库状态，刻意维持既有算法，不要贸然调整。
   ------------------------------------------------------------ */

const DIVVY_POOL_LOW_BALANCE_RATIO_ = 0.15;

async function fetchPoolStatus_() {
  const [topupsResult, txResult] = await Promise.all([
    supabaseClient
      .from('divvy_pool')
      .select('id, per_person_amount, currency, member_count, total_amount, created_at, created_by, note')
      .eq('trip_id', currentTripId)
      .order('created_at', { ascending: true }),
    supabaseClient
      .from('divvy_pool_transactions')
      .select('id, type, amount, currency, member_id, expense_id, note, created_at, member_count_snapshot')
      .eq('trip_id', currentTripId)
      .order('created_at', { ascending: true })
  ]);
  if (topupsResult.error) throw topupsResult.error;
  if (txResult.error) throw txResult.error;

  const idToName = (appState.memberIndex && appState.memberIndex.byId) || {};

  const topupsRaw = topupsResult.data || [];
  const topups = topupsRaw.map((row) => ({
    id: row.id,
    perPersonAmount: Number(row.per_person_amount) || 0,
    currency: row.currency,
    memberCount: row.member_count,
    totalAmount: Number(row.total_amount) || 0,
    createdAt: row.created_at,
    note: row.note || ''
  }));

  const transactions = (txResult.data || []).map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    memberName: row.member_id ? (idToName[row.member_id] || null) : null,
    expenseId: row.expense_id || null,
    note: row.note || '',
    createdAt: row.created_at,
    // 这笔交易发生当下的成员人数——分摊到「个人」时要用这个而不是「现在」的人数，
    // 不然新成员一加入，旧的支出份摊全部会跟着重新计算。旧资料（这个栏位加进来之前
    // 记的）没有这个快照，缺值时由呼叫端 fallback 回目前人数
    memberCountSnapshot: row.member_count_snapshot || null
  }));

  // 每种货币各自「上一次结程退余」的时间点，用来算「这一轮」收了多少（分母），
  // 不是历史总额——不然结程退余重新开一轮小额充值时，比例会被稀释、误判成快见底
  const lastRefundAtByCurrency = {};
  transactions.forEach((tx) => {
    if (tx.type === 'refund') lastRefundAtByCurrency[tx.currency] = tx.createdAt;
  });
  const isInCurrentRound = (currency, createdAt) => {
    const refundAt = lastRefundAtByCurrency[currency];
    if (!refundAt) return true;
    return new Date(createdAt) >= new Date(refundAt);
  };

  const currencyMap = {};
  const ensureCurrency = (currency) => {
    if (!currencyMap[currency]) {
      currencyMap[currency] = { currency, collected: 0, spent: 0, refunded: 0, roundCollected: 0 };
    }
    return currencyMap[currency];
  };

  topups.forEach((item) => {
    const entry = ensureCurrency(item.currency);
    entry.collected += item.totalAmount;
    if (isInCurrentRound(item.currency, item.createdAt)) {
      entry.roundCollected += item.totalAmount;
    }
  });

  transactions.forEach((tx) => {
    if (tx.type === 'refund') {
      ensureCurrency(tx.currency).refunded += tx.amount;
    } else if (tx.type === 'expense_refund') {
      // 已结算那一轮的金库消费被删除时补记的「消费退款」——钱已经照人数打散
      // 实际退给大家了，不是退回「现在这一轮」还能动用的余额，所以故意不计进
      // spent 也不计进 refunded，只留在 transactions 清单里给交易明细/报告显示，
      // 不影响 balance 的算法（跟 pool_expense_delete() 後端那边的设计一致）
    } else {
      ensureCurrency(tx.currency).spent += tx.amount;
    }
  });

  const currencies = Object.keys(currencyMap).map((currency) => {
    const entry = currencyMap[currency];
    const collected = roundAmount_(entry.collected);
    const spent = roundAmount_(entry.spent);
    const refunded = roundAmount_(entry.refunded);
    const balance = roundAmount_(collected - spent - refunded);
    const roundCollected = roundAmount_(entry.roundCollected);
    const ratio = roundCollected > 0 ? balance / roundCollected : 0;

    return {
      currency,
      collected,
      roundCollected,
      spent,
      refunded,
      balance,
      isLowBalance: roundCollected > 0 && ratio < DIVVY_POOL_LOW_BALANCE_RATIO_ - AMOUNT_TOLERANCE
    };
  });

  currencies.sort((a, b) => b.balance - a.balance);

  const hasAnyBalance = currencies.some((c) => c.balance > AMOUNT_TOLERANCE);
  const isTripSettled = topups.length > 0 && !hasAnyBalance;

  let settledAt = null;
  const refundTxs = transactions.filter((tx) => tx.type === 'refund');
  if (refundTxs.length > 0) {
    settledAt = refundTxs[refundTxs.length - 1].createdAt;
  }

  const session = getUserSession();
  const enablerUserId = topupsRaw.length > 0 ? topupsRaw[0].created_by : '';
  const canManagePool = !enablerUserId || (session && (enablerUserId === session.userId || appState.canDeleteTrip));

  return {
    enabled: topups.length > 0,
    isTripSettled,
    settledAt,
    currencies,
    topups,
    topupCount: topups.length,
    transactions,
    canManagePool: !!canManagePool
  };
}

async function loadTripData() {
  if (!currentTripId) {
    renderNoTripState();
    return;
  }

  poolLowBalanceAlerted = false;

  try {
    // syncMembersState_ 要先跑完（它会建立 appState.memberIndex），
    // fetchExpenses_／fetchRepayments_／fetchPoolStatus_ 才能正确把 member id
    // 换算回名字，所以不能跟其他撈取平行执行
    await syncMembersState_();

    const [categories, expensesRaw, repayments, tripCurrency, pool] = await Promise.all([
      fetchCategories_(),
      fetchExpenses_(),
      fetchRepayments_(),
      fetchTripCurrency_(),
      fetchPoolStatus_()
    ]);

    const { group: expenses, personal: personalExpenses } = splitExpensesByScope_(expensesRaw);

    appState.categories = categories;
    appState.expenses = expenses;
    appState.personalExpenses = personalExpenses;
    appState.repayments = repayments;
    appState.tripCurrency = tripCurrency;
    appState.pool = pool;
    staleDataCachedAt = null;

    appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
    appState.categorySummary = computeCategorySummaryClient_();

    cacheTripBootstrap_(currentTripId, {
      members: appState.members,
      categories: appState.categories,
      viewerName: appState.viewerName,
      unclaimedMembers: appState.unclaimedMembers,
      expenses: appState.expenses,
      personalExpenses: appState.personalExpenses,
      repayments: appState.repayments,
      tripCurrency: appState.tripCurrency
    });
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error; // 不是网路问题（例如权限被拒），往外丢给呼叫端处理
    }

    const cached = getCachedTripBootstrap_(currentTripId);
    if (!cached) {
      throw error; // 离线又没有任何快取可以顶，只好照实告知
    }

    appState.members = sortMembersAlphabetically(cached.data.members || []);
    appState.categories = cached.data.categories || [];
    appState.viewerName = cached.data.viewerName || '';
    appState.unclaimedMembers = cached.data.unclaimedMembers || [];
    appState.expenses = cached.data.expenses || [];
    appState.personalExpenses = cached.data.personalExpenses || [];
    appState.repayments = cached.data.repayments || [];
    appState.pool = null; // 金库状态没有快取（离线时无法判断余额是否安全），先清空避免残留上一趟旅程的资料
    appState.tripCurrency = cached.data.tripCurrency || normalizeCurrencyInfo(null);
    appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
    appState.categorySummary = computeCategorySummaryClient_();

    staleDataCachedAt = cached.cachedAt;
  }

  renderEverything();
  updateOfflineBanner();
}

/**
 * 将 Backend 回传的货币资讯（rates 是阵列）转换成前端好用的格式（rates 是 Map）
 * @param {Object} currencyInfo { baseCurrency, rates: [{ currency, rateToBase }] }
 * @return {Object} { baseCurrency, rates: { CURRENCY: rateToBase } }
 */
function normalizeCurrencyInfo(currencyInfo) {
  const safeInfo = currencyInfo || { baseCurrency: 'MYR', rates: [] };
  const rateMap = {};
  const updatedAtMap = {};

  (safeInfo.rates || []).forEach((item) => {
    rateMap[item.currency] = Number(item.rateToBase);
    updatedAtMap[item.currency] = item.updatedAt;
  });

  return { baseCurrency: safeInfo.baseCurrency || 'MYR', rates: rateMap, updatedAt: updatedAtMap };
}

/**
 * 只重新载入消费与结算总览（删除消费、或任何「手上没有最新那笔消费资料」的情况使用）
 */
async function refreshExpensesAndSummary() {
  const { group, personal } = splitExpensesByScope_(await fetchExpenses_());
  appState.expenses = group;
  appState.personalExpenses = personal;
  appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
  appState.categorySummary = computeCategorySummaryClient_();
  // ⚠️ 过渡期：汇率还没搬到 Supabase（5.7 才会做），appState.tripCurrency 暂不重新撈取

  renderDashboard();
  renderExpensesTable();
  renderSummaryPage();
  renderCategorySummary();
  renderCurrencySettings();
  renderMembersPage();
}

/**
 * 新增／编辑消费后的效能优化版刷新：addExpense／updateExpense 当下已经拿到了
 * 那笔消费最新、完整的资料（含 CanManage），不需要再整批重新撈一次 fetchExpenses_。
 * 总览／分类统计因为牵动其他笔消费的加总，用本地资料重新算一次即可，不用打网路请求
 * @param {Object} savedExpense addExpense／updateExpense 存回的完整消费纪录物件
 * @param {boolean} isNew 这次是新增（true）还是编辑既有消费（false）
 */
/**
 * 新增／编辑消费后的效能优化版刷新：addExpense／updateExpense 当下已经拿到了
 * 那笔消费最新、完整的资料（含 CanManage），不需要再整批重新撈一次 fetchExpenses_。
 * 总览／分类统计因为牵动其他笔消费的加总，用本地资料重新算一次即可，不用打网路请求。
 *
 * 依 savedExpense.Scope 决定放回哪个阵列——先把两个阵列裡「这个 ID」的旧资料
 * 都清掉，再依最新的 scope 插回正确的那一个，新增／编辑共用同一套逻辑，
 * 不用分开写两次；理论上一笔消费的 scope 不会中途改变（现有表单没有让你把
 * 已经存在的一般消费切成个人消费，反之亦然），这样写只是顺手对「万一之後
 * 真的开放切换 scope」多一层防呆，不会因为 scope 没变就漏更新
 * @param {Object} savedExpense addExpense／updateExpense 存回的完整消费纪录物件
 * @param {boolean} isNew 这次是新增（true）还是编辑既有消费（false）——目前只用来
 *   决定要不要防御性地当作「找不到旧资料时也要塞进去」，实际的放置逻辑两种
 *   情境是共用的
 */
async function refreshAfterExpenseSave(savedExpense, isNew) {
  appState.expenses = appState.expenses.filter((item) => item.ID !== savedExpense.ID);
  appState.personalExpenses = appState.personalExpenses.filter((item) => item.ID !== savedExpense.ID);

  if (savedExpense.Scope === 'personal') {
    appState.personalExpenses.push(savedExpense);
  } else {
    appState.expenses.push(savedExpense);
  }

  appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
  appState.categorySummary = computeCategorySummaryClient_();

  renderDashboard();
  renderExpensesTable();
  renderSummaryPage();
  renderCategorySummary();
  renderCurrencySettings();
  renderMembersPage(); // 同行页面的「待清算」余额、「参与 X 笔消费」都要跟着更新
  refreshMemberDetailPageIfOpen_(); // 私人消费在自己详情页里的那个分区也要跟着更新
}

/**
 * 只重新载入还款纪录与结算总览（新增／删除还款后使用）
 */
async function refreshRepayments() {
  appState.repayments = await fetchRepayments_();
  appState.summary = sortSummaryAlphabetically(computeSummaryClient_());

  renderDashboard();
  renderSummaryPage();
  renderMembersPage();
}

/**

 * 只重新载入成员清单与结算总览（新增／删除／合并成员后使用）
 */
async function refreshMembers() {
  await syncMembersState_();

  // ⚠️ 关键：消费/还款记录里的 Payer/Participants/FromMember/ToMember 存的都是
  // 「当时解析出来的显示名字」字串，不是 member id。只要有人改了昵称（或任何
  // 会影响「目前该显示的名字」的操作），这两份资料裡的名字字串就会跟「最新的
  // 成员名单」对不上——不重新撈一次的话，旧名字的钱会变成一个「查无此人」的
  // 幽灵条目，本人名下反而变成 0（这正是「消费记录突然变零」的真正原因）
  const [expensesRaw, repayments] = await Promise.all([
    fetchExpenses_(),
    fetchRepayments_()
  ]);
  const { group, personal } = splitExpensesByScope_(expensesRaw);
  appState.expenses = group;
  appState.personalExpenses = personal;
  appState.repayments = repayments;

  // 成员名单变了（新增/删除/合并/改名），结算总览一定要跟着重算——不然新成员根本不会
  // 出现在 appState.summary.balances 里（那个阵列是从「目前的成员名单」建出来的），
  // 同行页面就会看不到他的余额，要等下次重新整理页面才会补上
  appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
  appState.categorySummary = computeCategorySummaryClient_();

  renderMembersPage();
  renderPayerSelectOptions();
  renderParticipantList();
  renderRepaymentSelectOptions();
  renderDashboard();
  renderSummaryPage();
  renderExpensesTable();
  renderCategorySummary();
}

function renderEverything() {
  renderPayerSelectOptions();
  renderParticipantList();
  renderRepaymentSelectOptions();
  renderCategorySelectOptions();
  renderCategoryFilterChips();
  renderCategoryManageList();
  renderCategoryManagePreview_();
  renderCurrencySettings();
  renderDangerZoneButton();

  renderDashboard();
  renderExpensesTable();
  renderSummaryPage();
  renderMembersPage();
  renderCategorySummary();
  renderPoolSettingsPanel();
  renderInviteCard();
}

/**
 * 已连上 API，但目前完全没有任何旅程时的提示状态：
 * Dashboard 页面整个换成置中的欢迎画面（logo + slogan + 引导句 + 建立旅程按钮），
 * 不再是原本一堆面板各自塞一个小型空状态区块；其他分页（结算/账目/成员）
 * 还是可能被直接点进来，各自面板维持原本的空状态引导
 */
/**
 * 切换「某分页的全屏欢迎画面」与「该分页原本内容」的显示——两者互斥，
 * 每个分页各自的一对 id 组合见 PAGE_EMPTY_HERO_MAP
 * @param {string} heroId 欢迎画面容器 id
 * @param {string} normalId 该分页原本内容容器 id
 * @param {boolean} showHero true＝显示欢迎画面（隐藏原本内容），false＝反过来
 */
function togglePageEmptyHero_(heroId, normalId, showHero) {
  const hero = document.getElementById(heroId);
  const normal = document.getElementById(normalId);
  if (hero) hero.classList.toggle('is-hidden', !showHero);
  if (normal) normal.classList.toggle('is-hidden', showHero);
}

// Dashboard / 账目 / 结算 / 同行，每个分页各自的「欢迎画面」与「原本内容」容器 id 配对
const PAGE_EMPTY_HERO_MAP = [
  ['dashEmptyHero', 'dashNormalContent'],
  ['expensesEmptyHero', 'expensesNormalContent'],
  ['summaryEmptyHero', 'summaryNormalContent'],
  ['membersEmptyHero', 'membersNormalContent']
];

/**
 * 已连上 API，但目前完全没有任何旅程时的提示状态：
 * Dashboard / 账目 / 结算 / 同行四个分页整个换成置中的欢迎画面
 * （logo + slogan + 引导句 + 建立旅程按钮），不再是原本一堆面板各自塞一个
 * 小型空状态区块——不管从哪个分页点进来，看到的都是同一句引导、同一颗按钮。
 * 四个容器的内容完全一样，只在 renderEmptyBlock() 裡用 containerId 当 SVG
 * 渐层 id 的后缀避免重複，见 renderEmptyBlock() 的 level='page' 分支
 */
function renderNoTripState() {
  PAGE_EMPTY_HERO_MAP.forEach(([heroId, normalId]) => {
    togglePageEmptyHero_(heroId, normalId, true);
    renderEmptyBlock(heroId, null, t('system.noTripMsg'), 'addTripModal', t('tripModal.save'), 'page');
  });
  // 「完全没有旅程」跟「有旅程但还没有消费纪录」是两组互斥的 Hero，切到
  // 「没有旅程」这组的时候，另一组如果还留着 is-hidden 拿掉的状态，
  // 两个 Hero 会同时露出来，这里保险起见都藏掉
  document.getElementById('summaryNoDataBlock')?.style.setProperty('display', 'none');
  document.getElementById('dashNoExpensesBlock')?.style.setProperty('display', 'none');
}

function renderApiErrorState(message) {
  PAGE_EMPTY_HERO_MAP.forEach(([heroId, normalId]) => togglePageEmptyHero_(heroId, normalId, false));

  const title = t('system.loadFailed');
  // balanceMatrixPanel／settlementPanel 平常「没资料」的时候会被藏起来（见
  // renderBalanceMatrix() / renderSummaryPage()）——这里是要显示错误讯息，
  // 不是「没资料」，要先确保面板本身是打开的，不然错误讯息会被塞进一个
  // 已经隐藏的面板里，使用者根本看不到
  document.getElementById('balanceMatrixPanel')?.classList.remove('is-hidden');
  document.getElementById('settlementPanel')?.classList.remove('is-hidden');
  document.getElementById('repaymentPanel')?.classList.remove('is-hidden');
  renderEmptyBlock('recentActivityList', title, message);
  renderEmptyBlock('balanceMatrixList', title, message);
  hideBalanceMatrixToggle();
  renderEmptyBlock('balanceList', title, message);
  renderEmptyBlock('settlementList', title, message);
  renderEmptyBlock('repaymentList', title, message);
  renderEmptyBlock('expensesList', title, message);
  renderEmptyBlock('memberGrid', title, message);
}


/* ------------------------------------------------------------
   6. 页面导航（Sidebar / 底部 Tabbar 共用）
   ------------------------------------------------------------ */

/**
 * 依 NAV_ITEMS 的一项资料产生一颗桌面侧栏／手机抽屉共用的 .nav-item 按钮
 * （图示 + 文字标签这种结构）。标签用 data-i18n 而不是直接塞翻译好的文字，
 * 是为了让既有的 applyLanguage() 通用迴圈之後切语言时能自动更新，
 * 不用另外为导览写一套语言切换逻辑
 * @param {NavItem} item
 * @param {boolean} isActive 是否为开局预设显示的分页
 * @return {HTMLButtonElement}
 */
function buildNavItemButton_(item, isActive) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = isActive ? 'nav-item is-active' : 'nav-item';
  btn.setAttribute('data-page', item.page);
  btn.innerHTML = `
    <span class="nav-icon" aria-hidden="true">${item.icon}</span>
    <span class="nav-label" data-i18n="${item.labelKey}"></span>
  `;
  return btn;
}

/**
 * 依 NAV_ITEMS 的一项资料产生一颗手机底部导览的 .tab-item 按钮——跟
 * buildNavItemButton_() 不同的是图示没有包 .nav-icon 外层，沿用
 * #mobileTabbar「图示 + 短文字」的既有结构
 * @param {NavItem} item
 * @param {boolean} isActive
 * @return {HTMLButtonElement}
 */
function buildTabItemButton_(item, isActive) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = isActive ? 'tab-item is-active' : 'tab-item';
  btn.setAttribute('data-page', item.page);
  btn.innerHTML = `${item.icon}<span data-i18n="${item.labelKey}"></span>`;
  return btn;
}

/**
 * 依 NAV_ITEMS 渲染桌面侧栏、手机抽屉、手机底部导览三处的分页按钮——
 * 只在开机时呼叫一次就好，导览项目本身不会因为切换语言而变动，文字部分
 * 交给上面 data-i18n + 既有的 applyLanguage() 处理，不需要语言切换时重新渲染。
 * 必须在 initNavigation() 之前呼叫（後者要抓 [data-page] 按钮来绑点击事件，
 * 这些按钮得先存在），也要在 applyLanguage() 之前呼叫，标签才能在第一次
 * 套用语言时就跟着一起被翻译，不会先空白一下
 */
function renderMainNav() {
  const sidebarNavEl = document.getElementById('sidebarNav');
  if (sidebarNavEl) {
    // #navIndicator 那个滑动指示器是 sidebarNav 的固定装饰，不属于 NAV_ITEMS
    // 资料驱动的范围，先记住它、清空容器後再放回第一个
    const indicator = document.getElementById('navIndicator');
    sidebarNavEl.innerHTML = '';
    if (indicator) {
      sidebarNavEl.appendChild(indicator);
    }
    NAV_ITEMS.forEach((item) => {
      sidebarNavEl.appendChild(buildNavItemButton_(item, item.page === 'dashboard'));
    });
  }

  const drawerNavEl = document.getElementById('drawerNav');
  if (drawerNavEl) {
    drawerNavEl.innerHTML = '';
    NAV_ITEMS.forEach((item) => {
      drawerNavEl.appendChild(buildNavItemButton_(item, item.page === 'dashboard'));
    });
  }

  const tabbarEl = document.getElementById('mobileTabbar');
  if (tabbarEl) {
    // 中间那颗新增消费的 FAB 是吉祥物插画，不是线性图标，不适合塞进 NAV_ITEMS
    // 共用资料——先记住这个既有节点，清空容器後照「账目、FAB、结算」的
    // 顺序插回原位，视觉/位置完全不变，只是旁边四颗改成资料驱动产生
    const fabBtn = document.getElementById('mobileFabBtn');
    tabbarEl.innerHTML = '';
    NAV_ITEMS.forEach((item) => {
      if (item.tabbarHidden) {
        return;
      }
      tabbarEl.appendChild(buildTabItemButton_(item, item.page === 'dashboard'));
      if (item.page === 'expenses' && fabBtn) {
        tabbarEl.appendChild(fabBtn);
      }
    });
  }
}

function initNavigation() {
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      goToPage_(button.getAttribute('data-page'));
      closeDrawer();
    });
  });

  document.querySelectorAll('[data-navigate]').forEach((button) => {
    button.addEventListener('click', () => {
      goToPage_(button.getAttribute('data-navigate'));
    });
  });

  initDrawer();
}

/**
 * 绑定移动版侧滑抽屉（#sideMenu）的开关：汉堡按钮开启，
 * 关闭按钮／背景遮罩／Escape 键都能收起
 */
function initDrawer() {
  document.getElementById('drawerOpenBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);

  // 导览现在是全屏的，没有额外的关闭按钮——点击选项/语言/深色模式/登出以外的
  // 「空白处」（品牌区块本身、选项跟选项之间的空隙……）都能关闭，跟手势滑动是
  // 两条互补的关闭路径
  document.getElementById('sideMenu').addEventListener('click', (event) => {
    const isInteractive = event.target.closest('.nav-item, .theme-toggle');
    if (!isInteractive) {
      closeDrawer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  });
}

function openDrawer() {
  document.getElementById('sideMenu').classList.add('is-open');
  document.getElementById('drawerBackdrop').classList.add('is-visible');
  lockBodyScroll();
}

function closeDrawer() {
  document.getElementById('sideMenu').classList.remove('is-open');
  document.getElementById('drawerBackdrop').classList.remove('is-visible');
  if (modalStack.length === 0) {
    unlockBodyScroll();
  }
}

/**
 * 绑定三个手势：
 *   1. 下拉刷新——页面卷到最顶端时，在内容区往下拖，放开就重新整批载入目前旅程的资料
 *   2. 右半屏左滑——从萤幕右半边开始左滑（不用死贴最右边缘），滑够距离就打开
 *      侧滑导览（等同点汉堡按钮）
 *   3. 导览打开时向右滑——导览现在是全屏的，没有实体关闭按钮，从萤幕任何位置开始
 *      向右滑（不用像开启那样限定要贴著边缘）就能关闭，方向跟「打开」正好相反、
 *      符合直觉（导览是从右边推进来的，往右推回去就是关掉）
 *
 * 三个手势公用同一组 touch 事件监听、而不是分开各自注册：因为一根手指按下去的当下，
 * 不知道使用者接下来要往哪个方向滑，要等第一次有意义的移动方向出来才能判断是哪一种，
 * 判断出来之后就「锁定」这个方向，不会两个手势同时各自反应、互相打架。
 *
 * 边缘滑抽屉／关闭抽屉都刻意不做「跟著手指即时滑出」的效果——直接複用
 * openDrawer()／closeDrawer() 原本的 CSS transition，一放开（或滑超过门槛的当下）
 * 就播放跟点按钮一模一样的动画，这样不用重新处理 .side-drawer 的 transform／
 * transition 细节，风险最低。下拉刷新则维持「跟手」的即时视觉回馈，因为这个
 * 手势的重点本来就是过程中的反馈。
 */
function initTouchGestures() {
  const EDGE_ZONE_RATIO = 0.5; // 起点只要落在萤幕右半（不用死贴最右边缘）就算开启导览的候选，
                                // 原本是 10px 的窄边缘，太难点中，划好几次才有一次被 sense 到
  const DIRECTION_LOCK_PX = 10; // 移动超过这个距离才判断方向，避免手抖误判
  const DRAWER_OPEN_THRESHOLD_PX = 70;
  const DRAWER_CLOSE_THRESHOLD_PX = 70;
  const PTR_THRESHOLD_PX = 64;
  const PTR_MAX_PULL_PX = 96;
  const PTR_HOLD_HEIGHT_PX = 56;

  const ptrIndicator = document.getElementById('ptrIndicator');
  const ptrArrow = document.getElementById('ptrArrow');
  const ptrSpinner = document.getElementById('ptrSpinner');
  const sideMenu = document.getElementById('sideMenu');

  if (!ptrIndicator || !ptrArrow || !ptrSpinner || !sideMenu) {
    return; // 缺任何一个必要元素就整个不启用，不要半吊子运作
  }

  let touch = null; // { startX, startY, lastX, lastY, mode: null|'drawer'|'closeDrawer'|'ptr'|'none' }
  let drawerOpenedByGesture = false;
  let drawerClosedByGesture = false;
  let ptrRefreshing = false;

  function isGestureBlocked() {
    // Modal 开着的时候两个手势都不该启动，避免画面互相打架；导览开着的时候
    // 「下拉刷新」还是要挡（内容被盖住，刷新没有意义），但「向右滑关闭」要放行，
    // 所以导览开着不算在这个总闸门里，改在各自的判断式里处理
    return modalStack.length > 0;
  }

  function isInsideHorizontalScroller(target) {
    // 卡片轮播（.dash-card-track）、分类筛选（.chip-group／.category-pills）
    // 这些元素自己就靠左滑/右滑捲动，而且很可能整条／整张卡都落在萤幕右半——
    // 扩大边缘滑动的候选范围之后，如果不排除掉这些元素，在上面左滑会两边
    // 抢手势（该捲的卡片没捲动，导览却被打开了）。不特別列 class 名单，
    // 直接检查「是否真的能横向捲动」，之後新增的横向清单也会自动被涵盖到
    let el = target;
    while (el && el !== document.body) {
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function setPtrPull(distance) {
    ptrIndicator.style.height = `${distance}px`;
    const progress = Math.min(1, distance / PTR_THRESHOLD_PX);
    ptrArrow.style.transform = `rotate(${progress * 180}deg)`;
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || isGestureBlocked() || ptrRefreshing) {
      touch = null;
      return;
    }
    const t = event.touches[0];
    touch = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
      mode: null,
      // 开启导览：起点落在萤幕右半就算数，不用死贴最右边缘，但要排除掉
      // 横向捲动元素（卡片轮播／分类筛选），避免抢走它们自己的左滑手势；
      // 导览已经开著时要关闭，不用贴边，从萤幕任何位置开始向右滑都算
      // （导览这时候盖满一大块画面，随便按都是按在它上面）
      canEdgeSwipe: !sideMenu.classList.contains('is-open') &&
        t.clientX >= window.innerWidth * (1 - EDGE_ZONE_RATIO) &&
        !isInsideHorizontalScroller(t.target),
      canCloseDrawer: sideMenu.classList.contains('is-open'),
      canPullToRefresh: !sideMenu.classList.contains('is-open') && window.scrollY <= 0
    };
    drawerOpenedByGesture = false;
    drawerClosedByGesture = false;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!touch || event.touches.length !== 1) return;

    const t = event.touches[0];
    touch.lastX = t.clientX;
    touch.lastY = t.clientY;
    const dx = t.clientX - touch.startX;
    const dy = t.clientY - touch.startY;

    if (!touch.mode) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
        return; // 移动还太小，先不判断方向
      }
      if (touch.canCloseDrawer && dx > 0 && dx > Math.abs(dy)) {
        touch.mode = 'closeDrawer';
      } else if (touch.canEdgeSwipe && dx < 0 && Math.abs(dx) > Math.abs(dy)) {
        touch.mode = 'drawer';
      } else if (touch.canPullToRefresh && dy > 0 && dy > Math.abs(dx)) {
        touch.mode = 'ptr';
        ptrIndicator.classList.add('is-dragging');
      } else {
        touch.mode = 'none'; // 不是我们要处理的手势，放手交还给浏览器原本的行为（例如正常卷动）
      }
    }

    if (touch.mode === 'drawer') {
      event.preventDefault();
      if (!drawerOpenedByGesture && dx <= -DRAWER_OPEN_THRESHOLD_PX) {
        openDrawer();
        drawerOpenedByGesture = true;
      }
    } else if (touch.mode === 'closeDrawer') {
      event.preventDefault();
      if (!drawerClosedByGesture && dx >= DRAWER_CLOSE_THRESHOLD_PX) {
        closeDrawer();
        drawerClosedByGesture = true;
      }
    } else if (touch.mode === 'ptr') {
      // 拖到一半如果页面自己已经卷动开了（代表这其实不是真的贴著顶端在下拉），取消手势
      if (window.scrollY > 0) {
        ptrIndicator.classList.remove('is-dragging');
        setPtrPull(0);
        touch.mode = 'none';
        return;
      }
      event.preventDefault();
      // 阻尼曲线：拖得越多，每多拖 1px 实际增加的高度越少，手感比较像原生 App
      setPtrPull(Math.min(PTR_MAX_PULL_PX, dy * 0.5));
    }
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (!touch) return;
    const finishedTouch = touch;
    touch = null;

    if (finishedTouch.mode !== 'ptr') {
      return; // 'drawer' 已经在 touchmove 跨过门槛的当下就开好了，这里不用再做事；'none'/未判定 也不用处理
    }

    ptrIndicator.classList.remove('is-dragging');
    const finalPull = Math.min(PTR_MAX_PULL_PX, Math.max(0, finishedTouch.lastY - finishedTouch.startY) * 0.5);

    if (finalPull < PTR_THRESHOLD_PX) {
      setPtrPull(0);
      return;
    }

    ptrRefreshing = true;
    ptrArrow.classList.add('is-hidden');
    ptrSpinner.classList.remove('is-hidden');
    setPtrPull(PTR_HOLD_HEIGHT_PX);

    try {
      await loadTripData();
    } catch (error) {
      showToast('error', t('toast.refreshFailed'), error.message || t('system.unknownError'));
    } finally {
      ptrRefreshing = false;
      ptrArrow.classList.remove('is-hidden');
      ptrSpinner.classList.add('is-hidden');
      ptrArrow.style.transform = '';
      setPtrPull(0);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    if (touch && touch.mode === 'ptr') {
      ptrIndicator.classList.remove('is-dragging');
      setPtrPull(0);
    }
    touch = null;
  }, { passive: true });
}

function navigateToPage(pageId) {
  if (!PAGE_IDS.includes(pageId)) {
    return;
  }

  document.querySelectorAll('.page').forEach((section) => {
    section.classList.toggle('is-hidden', section.getAttribute('data-page-section') !== pageId);
  });

  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-page') === pageId);
  });

  updateHeaderForPage(pageId);
  positionNavIndicator();

  // 从别的分页（例如设置页开启金库）切回概览页时，要重新量一次两张卡片的高度——
  // renderEverything() 那次 syncDashCardHeights() 是在概览页还被 .is-hidden 藏著的
  // 情况下跑的，offsetHeight 量到的是 0（隐藏元素量不到真实高度），等於白跑一次，
  // 两张卡片实际上没有真的对齐。这里在切换「进入」概览页的当下，趁页面已经真的
  // 显示出来，再补一次量测才准
  if (pageId === 'dashboard') {
    syncDashCardHeights();
  }

  // 注意：捲动的其实是 window／body，不是 #appMain 自己（它没有独立的 overflow，
  // 原因跟 .app-shell 那边 Sidebar sticky 定位的理由一样，见 style.css 的说明）；
  // 之前写成 appMain.scrollTo() 在一个没有自己捲动範围的元素上呼叫，等於没有作用，
  // 切页从来没有真的把画面捲回顶端过
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHeaderForPage(pageId) {
  const meta = getPageMeta(pageId);
  const action = getPageAction(pageId);

  document.getElementById('pageTitle').textContent = meta.title;
  document.getElementById('pageSubtitle').textContent = meta.subtitle;

  const actionBtn = document.getElementById('headerActionBtn');
  const actionLabel = document.getElementById('headerActionLabel');

  if (action.modal) {
    actionBtn.style.display = 'inline-flex';
    actionLabel.textContent = action.label;
    actionBtn.setAttribute('data-open-modal', action.modal);
  } else {
    actionBtn.style.display = 'none';
  }
}

function positionNavIndicator() {
  const indicator = document.getElementById('navIndicator');
  const activeItem = document.querySelector('.sidebar-nav .nav-item.is-active');
  const sidebar = document.querySelector('.sidebar');
  const sidebarVisible = sidebar && window.getComputedStyle(sidebar).display !== 'none';

  if (!indicator || !activeItem || !sidebarVisible) {
    return;
  }

  indicator.style.transform = `translateY(${activeItem.offsetTop}px)`;
}


/* ------------------------------------------------------------
   7. Modal 开关逻辑（通用）
   ------------------------------------------------------------ */

function initModals() {
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-modal]');
    if (opener) {
      const modalId = opener.getAttribute('data-open-modal');

      if (modalId === 'addExpenseModal') {
        if (!currentTripId) {
          showToast('error', t('toast.pleaseSelectTrip'), t('toast.pleaseSelectTripForExpense'));
          return;
        }
        resetExpenseForm();
      }

      if (modalId === 'addMemberModal' && !currentTripId) {
        showToast('error', t('toast.pleaseSelectTrip'), t('toast.pleaseSelectTripForMember'));
        return;
      }

      if (modalId === 'addRepaymentModal') {
        openAddRepaymentModal();
        return;
      }

      if (modalId === 'tripPickerModal') {
        // 开之前先重新渲染一次清单，不然如果是从旧的快取画面直接开 Modal，
        // 可能会看到切换旅程/改名之前的旧清单（跟 openTripPickerModal() 是同一个考量，
        // 这里额外处理是因为这颗按钮走的是通用委派监听器，不是那支函式）
        renderTripPickerList();
      }

      if (modalId === 'renameTripModal') {
        // 铅笔按钮可能来自旅程标题旁边（没带 data-rename-trip-id，代表改目前这趟）
        // 或 tripPickerModal 清单里的任一行（带了 data-rename-trip-id，代表改那一行）——
        // 两种来源共用同一个 Modal，靠这个 data 属性分辨要改的到底是哪一趟旅程，
        // 存进 Modal 自己的 dataset 里，送出表单时才能拿到目标旅程 id
        const targetTripId = opener.getAttribute('data-rename-trip-id') || currentTripId;
        if (!targetTripId) {
          showToast('error', t('toast.pleaseSelectTrip'), '');
          return;
        }
        document.getElementById('page-rename-trip').dataset.targetTripId = targetTripId;
        document.getElementById('renameTripNameInput').value = getTripName(targetTripId);
      }

      openModal(modalId);
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', closeActiveModal);
  });

  document.getElementById('modalBackdrop').addEventListener('click', closeActiveModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalStack.length > 0) {
      closeActiveModal();
      return;
    }

    // 焦点困住（Focus Trap）：Modal 开着的时候，Tab／Shift+Tab 只能在最上层
    // Modal 内部的可聚焦元素之间循环，不能穿透跑到被压在背景、变暗且不能
    // 互动的内容上——不然键盘使用者会「Tab 着 Tab 着人就跑出 Modal 外」
    if (event.key === 'Tab' && modalStack.length > 0) {
      const topModal = document.getElementById(modalStack[modalStack.length - 1]);
      const focusables = getFocusableElements_(topModal);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!topModal.contains(document.activeElement)) {
        // 焦点不知何故（例如画面重画）掉到 Modal 外面了，拉回来
        event.preventDefault();
        first.focus();
      }
    }
  });

  document.getElementById('expenseForm').addEventListener('submit', (event) => {
    event.preventDefault();
    handleExpenseFormSubmit();
  });

  document.getElementById('memberForm').addEventListener('submit', (event) => {
    event.preventDefault();
    handleMemberFormSubmit();
  });

  document.getElementById('renameTripForm').addEventListener('submit', (event) => {
    event.preventDefault();
    // 目标旅程 id 是开 Modal 当下存进 dataset 的（见上面 [data-open-modal] 的
    // 'renameTripModal' 特判），送出时读出来，不能直接假设改的是 currentTripId
    handleRenameTripFormSubmit(document.getElementById('page-rename-trip').dataset.targetTripId);
  });
}

/* ------------------------------------------------------------
   导航历史串接（安卓 / PWA 系统返回键）
   ------------------------------------------------------------
   背景：全项目原本零处使用 History API，导致在安卓/PWA 环境按系统返回键
   会直接整个退出 App，而不是先关掉目前最上层的 Modal／子页面。这里补上
   最小必要的串接：每次「往前」的导航（开 Modal、切主分页、进成员详情页）
   都 pushState 一份状态，让返回键有东西可以退；每次「往回」（使用者自己
   点关闭／背景／Esc／返回按钮触发的）都要主动 history.back() 把对应的
   状态弹掉，不然历史栈只增不减，要按好几次返回键才能真正离开。

   用两组旗标彼此配合，避免「popstate 触发关闭 → 关闭又呼叫 back() →
   触发下一次 popstate」的无限循环：
   - isPopStateInProgress：目前正在处理一次「货真价实、使用者按了返回键」
     的 popstate。这段期间呼叫到的关闭函式，内部不能再自己呼叫一次
     history.back()／pushState——History 早就自己走过了，重複呼叫只会
     多退/多推一层，跟画面对不上。
   - pendingProgrammaticPops：记录「接下来还有几次 popstate 是我们自己
     呼叫 history.back()／history.go() 清理用的」，这几次要整个忽略掉，
     不能被误判成使用者真的按了返回键。用计数而不是单纯的布林值，是因为
     像 closeAllModals() 这种一次关很多层的情境，理论上也可能对应到不只
     一次 popstate。
   ------------------------------------------------------------ */
let isPopStateInProgress = false;
let pendingProgrammaticPops = 0;

/**
 * 「往前」的导航动作（开 Modal、切主分页、进成员详情页）呼叫这个，推入一份
 * history 状态给返回键退。如果目前正在处理一次真正的返回键 popstate，代表
 * History 已经自己走到这个状态了，不能重複 push（目前的呼叫时机不会真的
 * 触发到这个分支，纯粹是防呆）
 * @param {Object} state 存进 history 的状态物件，至少要有 appNavType 分辨类型
 */
function pushAppHistoryState_(state) {
  if (isPopStateInProgress) {
    return;
  }
  history.pushState(state, '');
}

/**
 * 「往回」的动作（使用者自己点 X／背景／Esc／返回按钮……）呼叫这个，把先前
 * pushAppHistoryState_() 留下的状态弹掉，避免历史栈只增不减。可以传入要
 * 一次弹掉几步（closeAllModals() 一次关很多层 Modal 时会用到）
 * @param {number} [steps=1] 要往回退几步
 */
function popAppHistoryState_(steps) {
  if (isPopStateInProgress) {
    // 这次的关闭本来就是「使用者按了返回键」引发的，History 已经自己往回
    // 走过一次了，不能再呼叫一次 back()/go()，不然会多退一层
    return;
  }
  const n = steps || 1;
  // 不管这次要跳几步，同一个 history.back()/history.go() 呼叫规格上都只会
  // 触发「一次」popstate（浏览器把它当成单一个巡覽任务处理），所以计数只加 1，
  // 不是加 n
  pendingProgrammaticPops += 1;
  if (n === 1) {
    history.back();
  } else {
    history.go(-n);
  }
}

/**
 * 依目前画面「最上层是什么」决定返回键要收掉哪一层：Modal 永远画在最上面，
 * 优先关；没有 Modal 才轮到二级页面（可能一路钻了好几层，见 secondaryPageStack）；
 * 两者都没有才是「五个主分页之间」的切换，靠 popstate 事件带回来的 state
 * 决定要换回哪一页。如果连主分页的 history 状态都没有了（代表已经回到 App
 * 一开始载入时那笔真正的浏览器分录），这里刻意什么都不做——让浏览器/系统
 * 自己接手，正常离开／关闭这个分页，不要卡住不让走
 * @param {PopStateEvent} event
 */
function handleAppPopState_(event) {
  if (pendingProgrammaticPops > 0) {
    pendingProgrammaticPops -= 1;
    return;
  }

  isPopStateInProgress = true;
  try {
    if (modalStack.length > 0) {
      closeActiveModal();
      return;
    }

    if (secondaryPageStack.length > 0) {
      closeSecondaryPage_();
      return;
    }

    const state = event.state;
    if (state && state.appNavType === 'page' && PAGE_IDS.includes(state.pageId)) {
      navigateToPage(state.pageId);
    }
  } finally {
    isPopStateInProgress = false;
  }
}

/**
 * 切主分页专用的导航入口——跟单纯同步画面用的 navigateToPage() 分开，是因为
 * navigateToPage() 也会被「返回键退回上一页」「删除旅程後扒回设置页顶端」
 * 这类「不该 push 新状态」的情境呼叫，混在一起会 push 出重複/错位的分录
 * （见 closeSecondaryPage_() 的说明）。真正代表「使用者主动切去某个分页」
 * 的入口只有底部导览/侧边导览的点击，统一走这支
 * @param {string} pageId
 */
function goToPage_(pageId) {
  navigateToPage(pageId);
  pushAppHistoryState_({ appNavType: 'page', pageId });
}

/**
 * 目前 nav 高亮显示的是哪个主分页——直接读 DOM（[data-page].is-active 是
 * navigateToPage() 自己会维护的状态），不用另外开一个变量去同步；二级页面
 * 显示期间 navigateToPage() 不会被呼叫，nav 的高亮状态会持续维持在「进二级
 * 页面之前」原本在哪一页，secondaryPageStack 清空後要退回主分页时，靠这个
 * 函式就能正确知道该退去哪里，不用每个 showSecondaryPage_() 呼叫端自己传
 * @return {string}
 */
function getCurrentMainPageId_() {
  const activeBtn = document.querySelector('[data-page].is-active');
  return activeBtn ? activeBtn.getAttribute('data-page') : 'dashboard';
}

/* ------------------------------------------------------------
   二级页面管理（Secondary Page Manager）
   ------------------------------------------------------------
   阶段 8：把「只读、使用者可能还要继续往下钻」的深层内容（消费明细、
   分类消费清单、全部消费记录、金库明细、最优结算建议、账单统计）从
   Modal 改成二级页面——这类内容不是「我在做一件临时的事」（那种维持用
   Modal：表单、确认、快速选择），而是「我想再多看一点、可能还要继续点
   进更深一层」，用整页 + 返回键比蒙层 Modal 更符合语境，也更方便阶段 2
   接上的系统返回键操作。

   泛化自原本专门给「成员消费明细」写的 openMemberDetailPage() /
   closeSecondaryPage_()：不是为每个二级页面各写一份开关逻辑，而是
   用 secondaryPageStack 这个堆叠统一管理，支援连续往下钻（例如「账单
   统计」点进某个分类的「分类消费清单」，是两层二级页面叠在一起）。
   ------------------------------------------------------------ */

/**
 * 切换到一个二级页面。目前显示的那一层（可能是某个主分页，也可能是另一个
 * 二级页面——支援连续往下钻）会被藏起来，新的这层叠上去、捲回顶端，並
 * push 一份 history 状态给返回键/返回按钮退。
 *
 * 如果这个页面本来就已经是堆叠最上层（例如私人消费编辑後 refreshMemberDetailPageIfOpen_()
 * 重新渲染内容，不是真的「导航过去」），不会重複 push history，也不会把
 * 捲动位置弹回顶端打断使用者——只有画面上真的新叠上一层时才做这两件事
 * @param {string} pageId 对应 <section id="page-${pageId}"> 的那个 id 片段
 */
function showSecondaryPage_(pageId) {
  const alreadyTopmost = secondaryPageStack[secondaryPageStack.length - 1] === pageId;

  document.querySelectorAll('.page').forEach((section) => {
    section.classList.add('is-hidden');
  });
  const pageEl = document.getElementById(`page-${pageId}`);
  if (pageEl) {
    pageEl.classList.remove('is-hidden');
  }

  if (alreadyTopmost) {
    return;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  secondaryPageStack.push(pageId);
  pushAppHistoryState_({ appNavType: 'secondaryPage', pageId });
}

/**
 * 离开目前最上层的二级页面。堆叠裡还有上一层的话（连续钻了好几层），退回
 * 显示那一层；堆叠空了的话，代表已经退到底，回到 getCurrentMainPageId_()
 * 记得的那个主分页——用 navigateToPage() 把 nav 高亮/header 标题都复原，
 * 不是简单显示/隐藏就好。
 *
 * 这支函式会在两种情境下被呼叫：使用者点画面上的「返回」按钮，或使用者按了
 * 系统返回键（見 handleAppPopState_()）。两种情境都是「往回」，该做的是把
 * showSecondaryPage_() 当初 push 的那份状态弹掉（popAppHistoryState_()
 * 内部已经会分辨这次是不是该真的呼叫 history.back()），不能反过来 push
 * 一份新状态
 */
function closeSecondaryPage_() {
  const closingPageId = secondaryPageStack.pop();
  if (closingPageId) {
    const closingPageEl = document.getElementById(`page-${closingPageId}`);
    if (closingPageEl) {
      closingPageEl.classList.add('is-hidden');
    }
  }

  if (secondaryPageStack.length > 0) {
    const previousPageId = secondaryPageStack[secondaryPageStack.length - 1];
    const previousPageEl = document.getElementById(`page-${previousPageId}`);
    if (previousPageEl) {
      previousPageEl.classList.remove('is-hidden');
    }
  } else {
    navigateToPage(getCurrentMainPageId_());
  }

  popAppHistoryState_();
}

/**
 * 绑定所有二级页面共用的「返回」按钮（.secondary-page-back-btn）——统一用
 * 事件委派绑一次，7 个二级页面（成员消费明细 + 阶段 8 新增的 6 个）不用
 * 各自重複绑一次点击事件，之後再新增二级页面也不用回来补这段
 */
function initSecondaryPageBackButtons_() {
  document.querySelectorAll('.secondary-page-back-btn').forEach((btn) => {
    btn.addEventListener('click', () => closeSecondaryPage_());
  });
}

/* ------------------------------------------------------------
   Modal Stack Manager
   ------------------------------------------------------------
   支援多层弹窗同时存在（例如从「成员总览」点进「消费明细」）：
   每层各自往上叠加 z-index，背景遮罩永远贴在「最上层」正下方，
   让下层的 Modal 呈现被遮罩的「后退景深」效果；关闭时只收起最
   上面一层，下层会自动恢复成可视/可互动状态，达到回退动画的效果。
   ------------------------------------------------------------ */

// 统一 z-index 尺度：这两个常数原本是 500／20，跟 style.css 的
// --z-modal(50) 完全是两套不相干的数字。Modal 是用 inline style 动态写
// z-index（优先权高过 CSS class），所以真正决定「Modal 到底叠多高」的
// 其实是这里，不是 CSS 那个 50——但 Toast（--z-toast:80）靠的就是「一定要
// 盖过 Modal 叠到很深的极端情况」，两套算式不同调的话，其中一边随便调一下
// 数字就可能让 Toast 被压到 Modal 底下看不见。现在改成落在 --z-modal(50)
// 到 --z-toast(80) 这个区间内爬升：BASE 直接对齐 --z-modal 的值，STEP=5
// 让每往下钻一层多垫 5，backdrop 比同一层的 Modal 本身低 3。这个专案裡
// 最深只钻过 2 层（例如「账单统计」→「分类消费清单」，或 tripPickerModal→
// renameTripModal），照这个算法最深第 6 层才会真的碰到 --z-toast 的上限，
// 留了很充足的余裕；如果之後真的做出需要叠更多层的功能，记得同步检查
// 这里跟 --z-toast 还留不留得住这个「Modal 永远压不过 Toast」的关系
const MODAL_BASE_Z_INDEX = 50;
const MODAL_Z_INDEX_STEP = 5;

// 判断「可以被键盘 Tab 到」的元素范围：常见可聚焦标签 + 没被 disabled／
// tabindex="-1" 排除，也顺便排除画面上还隐藏著的（display:none 或 .is-hidden
// 让 offsetParent 变 null），焦点管理／Tab 循环都靠这份清单
const FOCUSABLE_SELECTOR_ = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 取得容器内目前「看得到、可以被 Tab 到」的可聚焦元素清单
 * @param {HTMLElement} container
 * @return {HTMLElement[]}
 */
function getFocusableElements_(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR_))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * 开启一个 Modal，推入堆叠最上层
 * @param {string} modalId Modal 的 DOM id
 */
/**
 * 7 个含文字输入欄位、会叫出键盘的表单型 Modal，2026-08 改成二级页面——
 * 手机 iOS「加到主屏幕」standalone 模式下，Modal 遮罩＋锁背景捲动跟键盘
 * 收起互动時有个排查七轮才確定、无法从网页端修正的 WKWebView 原生渲染
 * bug（键盘收起後渲染范围没收回去，底部露出连 DOM 都选不到的空白）。
 * 二级页面走「整页替换主内容区」，没有遮罩、没有 position:fixed／
 * overflow:hidden 锁背景，天生不会踩到这个坑。
 * 集中在 openModal() 這裡做转址，而不是逐一改调用端——全站十几处
 * openModal('addExpenseModal') 之类的呼叫、以及 HTML 上 data-open-modal
 * 属性（含 getPageAction() 动态设的），全部原样保留不用动，转址表以外的
 * 其余 7 个 Modal（纯清单/确认框/图片检视器，不会叫出键盘）不受影响
 */
const MODAL_TO_SECONDARY_PAGE = {
  addExpenseModal: 'add-expense',
  addMemberModal: 'add-member',
  renameTripModal: 'rename-trip',
  addCategoryModal: 'add-category',
  addTripModal: 'add-trip',
  addRepaymentModal: 'add-repayment',
  editRepaymentModal: 'edit-repayment',
};

/**
 * openModal(modalId) 的对应关闭端——同一张 MODAL_TO_SECONDARY_PAGE 转址表，
 * 转址过的 7 个表单送出成功後呼叫 closeSecondaryPage_()，其余仍是 Modal
 * 的呼叫 closeActiveModal()。这几个表单各自的送出函式（handleMemberFormSubmit
 * 等）统一走这支，不用各自记住自己转址過去了、要改叫哪一支關閉函式
 */
function closeModal_(modalId) {
  if (MODAL_TO_SECONDARY_PAGE[modalId]) {
    closeSecondaryPage_();
  } else {
    closeActiveModal();
  }
}

function openModal(modalId) {
  if (MODAL_TO_SECONDARY_PAGE[modalId]) {
    showSecondaryPage_(MODAL_TO_SECONDARY_PAGE[modalId]);
    return;
  }

  const modal = document.getElementById(modalId);
  if (!modal) {
    return;
  }

  // 如果这颗 Modal 本来就已经是堆叠最上层（例如同一颗按钮被重複点了两下），
  // 画面上不会有新的一层出现，就不该跟着推入新的 history 状态，不然会变成
  // 「按一次返回键，画面明明没变，却已经退掉一层」的错位
  const isAlreadyTopmost = modalStack[modalStack.length - 1] === modalId;

  // 若堆叠中已经有其他 Modal，把它标记为「背景层」（变暗、缩小），营造景深堆叠感
  if (modalStack.length > 0) {
    const previousTopId = modalStack[modalStack.length - 1];
    if (previousTopId !== modalId) {
      document.getElementById(previousTopId).classList.add('modal-dimmed');
    }
  }

  // 记住这颗 Modal 打开当下焦点原本在哪个元素上，关闭时要还回去（见
  // closeTopModalLayer_()）；同一颗 Modal 重复点开不重複记录，理由跟下面
  // modalStack 不重複推入一样
  if (!isAlreadyTopmost) {
    modalFocusStack.push(document.activeElement);
  }

  // 同一个 Modal 不重复推入堆叠
  modalStack = modalStack.filter((id) => id !== modalId);
  modalStack.push(modalId);

  const depth = modalStack.length;
  modal.style.zIndex = String(MODAL_BASE_Z_INDEX + depth * MODAL_Z_INDEX_STEP);
  modal.classList.add('is-open');

  const backdrop = document.getElementById('modalBackdrop');
  backdrop.style.zIndex = String(MODAL_BASE_Z_INDEX + depth * MODAL_Z_INDEX_STEP - 3);
  backdrop.classList.add('is-visible');

  lockBodyScroll();

  // 把焦点移进刚打开的 Modal——优先给第一个可聚焦的表单栏位／按钮，找不到的话
  // （例如纯展示内容的 Modal）退而求其次聚焦 Modal 本身，不然键盘/萤幕阅读器
  // 使用者的焦点还留在背景已经变暗、不能互动的页面上，会「看得到却摸不到」。
  // 用 setTimeout 让画面先套用 .is-open（含 display 变化）再抓可聚焦元素，
  // 不然这一刻元素可能都还是 offsetParent === null 的隐藏状态，抓不到
  setTimeout(() => {
    const focusables = getFocusableElements_(modal);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      if (!modal.hasAttribute('tabindex')) {
        modal.setAttribute('tabindex', '-1');
      }
      modal.focus();
    }
  }, 0);

  if (!isAlreadyTopmost) {
    pushAppHistoryState_({ appNavType: 'modal', modalId });
  }
}

/**
 * 关闭堆叠最上层的 Modal；若下面还有其他 Modal，会自动恢复显示（回退效果）
 */
function closeActiveModal() {
  closeTopModalLayer_(true);
}

/**
 * 实际执行「收起堆叠最上层 Modal」的画面逻辑，抽出来是因为 closeAllModals()
 * 一次要关好几层时，每一层各自的 history 清理不能各自独立呼叫
 * popAppHistoryState_()——那样等於连续呼叫好几次 history.back()，
 * 时序上会跟浏览器实际触发 popstate 的顺序打架。改成画面先一次性全部收完，
 * 最後再统一批次弹掉对应数量的 history 状态（见 closeAllModals()）
 * @param {boolean} shouldPopHistory 是否连带清掉这一层对应的 history 状态；
 *   一般的「关掉最上层」用 true，closeAllModals() 内部迴圈用 false
 */
function closeTopModalLayer_(shouldPopHistory) {
  const topModalId = modalStack.pop();
  if (!topModalId) {
    return;
  }

  document.getElementById(topModalId).classList.remove('is-open');

  // 把焦点还给打开这颗 Modal 之前原本聚焦的元素（通常是触发它的按钮），
  // 使用者才不会在 Modal 关闭後「跟丢」焦点、还得自己重新 Tab 一次去找。
  // 如果那个元素已经不在画面上了（例如背景资料整个重画过），就不勉强，
  // 交给浏览器预设行为（通常会落到 body）
  const previouslyFocused = modalFocusStack.pop();
  if (previouslyFocused && document.body.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }

  if (modalStack.length === 0) {
    document.getElementById('modalBackdrop').classList.remove('is-visible');
    // 侧边抽屉可能跟 Modal 同时开着（例如抽屉里点了「设定」跳出 Modal）——
    // 只有两边都关了才能真的解除背景锁定，不然抽屉还开着，背景却先被放开了
    const drawerStillOpen = document.getElementById('sideMenu').classList.contains('is-open');
    if (!drawerStillOpen) {
      unlockBodyScroll();
    }
  } else {
    // 还有更下面一层 Modal，背景遮罩退回贴在新的最上层正下方，呈现回退景深
    const newTopId = modalStack[modalStack.length - 1];
    const newDepth = modalStack.length;
    document.getElementById('modalBackdrop').style.zIndex = String(MODAL_BASE_Z_INDEX + newDepth * MODAL_Z_INDEX_STEP - 3);
    document.getElementById(newTopId).classList.remove('modal-dimmed');
  }

  if (shouldPopHistory) {
    popAppHistoryState_();
  }
}

/**
 * 一次关闭所有 Modal（例如切换旅程、语言等大动作后，避免残留的弹窗状态卡住畫面）。
 * 画面先整批收完，最後再一次性批次弹掉对应数量的 history 状态，理由见
 * closeTopModalLayer_() 的说明
 */
function closeAllModals() {
  const countToClose = modalStack.length;
  while (modalStack.length > 0) {
    closeTopModalLayer_(false);
  }
  if (countToClose > 0) {
    popAppHistoryState_(countToClose);
  }
}

/**
 * 串接 History API：设定开局的基準状态（用 replaceState，不能用 pushState——
 * 概览页是「最外层」，不该额外多推一笔分录，不然使用者在最外层按一次返回键，
 * 退的会是这笔多余的分录而不是真的离开 App），并挂上
 * popstate 监听。只会在 startAppAfterAuth() 里呼叫一次（登入成功只会真正
 * 进入 App 一次，见 startAppAfterAuth() 的两个呼叫点都是互斥的），
 * 不用担心重複挂听器
 */
function initAppHistoryNavigation() {
  history.replaceState({ appNavType: 'page', pageId: 'dashboard' }, '');
  window.addEventListener('popstate', handleAppPopState_);
}

/**
 * 开启共用的二次确认 Modal。预设维持原本「确定要删除吗？／确认删除」的红色警示样式
 * （现有那些「删除」情境完全不用改呼叫方式），非删除的情境（结清／合并／退出旅程／
 * 汇率警告……）可以透过 options 换成对应的标题、按钮文字，不然会一律显示成「删除」，
 * 语意对不上实际在做的事（这个共用 Modal 原本就是照著「删除」场景设计的，后来
 * 陆续被借去做其他二次确认，只是没有跟著把文字也参数化）
 * @param {string} message 内容文字
 * @param {Function} onConfirm 按下确认按钮要执行的动作
 * @param {Object} [options]
 * @param {string} [options.title] 标题，不给则维持预设的删除警语
 * @param {string} [options.confirmLabel] 确认按钮文字，不给则维持预设「确认删除」
 * @param {boolean} [options.danger=true] 确认按钮是否用红色警示样式；删除类操作维持
 *   红色是对的，但结清/合并这类「确认执行」而非「确认删除」的操作传 false，
 *   改用一般的强调色按钮，不要让使用者誤以为是危险操作而却步
 */
function openConfirmModal(message, onConfirm, options) {
  const opts = options || {};

  document.getElementById('confirmText').textContent = message;
  document.getElementById('confirmTitle').textContent = opts.title || t('confirm.title');

  const confirmBtn = document.getElementById('confirmActionBtn');
  const freshBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(freshBtn, confirmBtn);

  freshBtn.querySelector('.btn-label').textContent = opts.confirmLabel || t('confirm.confirmDelete');
  const isDanger = opts.danger !== false;
  freshBtn.classList.toggle('btn-danger', isDanger);
  freshBtn.classList.toggle('btn-primary', !isDanger);

  freshBtn.addEventListener('click', async () => {
    setButtonLoading(freshBtn, true);
    try {
      await onConfirm();
      // onConfirm 有可能自己已经关掉 confirmModal 又开了别的 Modal（比如结程／
      // 删除已结算金库消费後跳出的退款明细），这种时候堆叠最上层已经不是
      // confirmModal 了，不能再关一次，不然会把 onConfirm 刚打开的那颗新 Modal
      // 关掉——只在 confirmModal 还在最上层（onConfirm 没动过 Modal）时才关
      if (modalStack[modalStack.length - 1] === 'confirmModal') {
        closeActiveModal();
      }
    } catch (error) {
      showToast('error', t('toast.actionFailed'), error.message);
    } finally {
      setButtonLoading(freshBtn, false);
    }
  });

  openModal('confirmModal');
}


/* ------------------------------------------------------------
   8. 新增 / 编辑消费表单
   ------------------------------------------------------------ */

function initSegmentedControl() {
  const buttons = document.querySelectorAll('#splitTypeControl .segmented-item');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((btn) => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      currentSplitType = button.getAttribute('data-split-type');
      toggleCustomSplitInputs();
      updateCustomSplitTotal();
    });
  });

  document.getElementById('expenseAmount').addEventListener('input', updateCustomSplitTotal);
  document.getElementById('expenseCurrency').addEventListener('change', updateCustomSplitTotal);
  document.getElementById('fillRemainingBtn').addEventListener('click', handleFillRemainingAmount);

  initExpenseSourceControl();
}

/**
 * 绑定记账 Modal 的「资金来源」分段控制（正常记账 / 金库支出 / 个人代垫归还）
 * 这个选择器本身的显示/隐藏由 resetExpenseForm() 依 appState.pool 是否开启决定，
 * 这里只负责点击切换
 */
function initExpenseSourceControl() {
  const control = document.getElementById('expenseSourceControl');
  if (!control) return;

  control.querySelectorAll('.segmented-item').forEach((button) => {
    button.addEventListener('click', () => {
      setExpenseSourceControl(button.getAttribute('data-expense-source'));
    });
  });
}

/**
 * 切换记账 Modal 的资金来源模式，同步分段控制的选取状态、提示文案，
 * 以及付款人/分账方式/参与人这几个只有「正常记账」才需要的栏位显示与否
 * @param {string} source 'normal' | 'personal' | 'deduct'
 */
function setExpenseSourceControl(source) {
  currentExpenseSource = source;

  document.querySelectorAll('#expenseSourceControl .segmented-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-expense-source') === source);
  });

  const hintEl = document.getElementById('expenseSourceHint');
  const hintKeyMap = {
    normal: 'expense.sourceNormalHint',
    personal: 'expense.sourcePersonalHint',
    deduct: 'expense.sourceDeductHint'
  };
  if (hintEl) {
    hintEl.textContent = t(hintKeyMap[source] || hintKeyMap.normal);
  }

  const payerField = document.getElementById('expensePayerField');
  const splitSection = document.getElementById('expenseSplitSection');
  const participantsSection = document.getElementById('expenseParticipantsSection');
  const payerInput = document.getElementById('expensePayer');

  // 付款人栏位：金库支出（钱直接从金库出，没有人「先垫付」）、个人消费
  // （付款人固定就是自己，不需要再选一次）这两种都不需要显示付款人栏位
  const hidePayerField = source === 'deduct' || source === 'personal';
  if (payerField) payerField.classList.toggle('is-hidden', hidePayerField);
  if (payerInput) payerInput.required = source === 'normal';

  // 个人消费的付款人固定带出「自己」，不给选——这笔钱本来就只跟自己有关，
  // 连「代付」这个概念都不适用（代付是在同行人之间发生的事）
  if (source === 'personal' && payerInput) {
    const viewer = getViewerName();
    if (viewer) {
      payerInput.value = viewer;
    }
  }

  // 分账方式／参与人：只有「正常记账」才需要——金库支出的钱从大家已经打进去的
  // 预付款直接扣，个人消费根本不跟任何人分账，两者都不会在成员之间产生欠款
  const hideSplitAndParticipants = source !== 'normal';
  if (splitSection) splitSection.classList.toggle('is-hidden', hideSplitAndParticipants);
  if (participantsSection) participantsSection.classList.toggle('is-hidden', hideSplitAndParticipants);

  // 货币：只有「金库支出」限定在金库目前有登记过的货币里选（旅行常常换好几种货币，
  // 金库余额是按货币分开记的，扣款只能从有余额的那个货币扣）；正常记账／个人消费
  // 两者都用完整的货币清单，跟「正常记账」的行为一致
  const currencySelect = document.getElementById('expenseCurrency');
  if (currencySelect) {
    currencySelect.disabled = false;
    if (source === 'deduct' && appState.pool && appState.pool.currencies && appState.pool.currencies.length > 0) {
      const poolCurrencies = appState.pool.currencies.map((c) => c.currency);
      currencySelect.innerHTML = poolCurrencies.map((code) => `<option value="${code}">${code}</option>`).join('');
    } else if (source !== 'deduct') {
      renderCurrencySelectOptions('expenseCurrency', appState.tripCurrency.baseCurrency);
    }
  }
}

/**
 * 判断目前分账模式是否需要每人各自输入一个数值
 * （均分不需要；精确金额／百分比／份额都需要）
 * @return {boolean}
 */
function isValueInputMode() {
  return currentSplitType !== 'equal';
}

/**
 * 「一键均分剩余金额」：精确金额模式下把剩余金额、百分比模式下把剩余百分比，
 * 平均分给「有勾选参与、但栏位还是空白」的成员
 * 防呆：如果没有人还留空，或已经填满/填超过，会提示使用者而不是硬填
 */
function handleFillRemainingAmount() {
  const isPercentage = currentSplitType === 'percentage';
  const totalPool = isPercentage ? 100 : (parseFloat(document.getElementById('expenseAmount').value) || 0);

  if (!isPercentage && totalPool <= 0) {
    showToast('error', t('toast.pleaseEnterAmountFirst'), '');
    return;
  }

  const allInputs = Array.from(document.querySelectorAll('#participantList .participant-amount-input:not(:disabled)'));
  const filledInputs = allInputs.filter((input) => input.value.trim() !== '');
  const emptyInputs = allInputs.filter((input) => input.value.trim() === '');

  if (emptyInputs.length === 0) {
    showToast('info', t('toast.noEmptyFields'), t('toast.noEmptyFieldsMsg'));
    return;
  }

  const filledSum = filledInputs.reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
  const remaining = Math.round((totalPool - filledSum) * 100) / 100;

  if (remaining <= 0) {
    const filledText = isPercentage ? `${filledSum.toFixed(1)}%` : formatMoney(filledSum);
    showToast('error', t('toast.noRemainingAmount'), t('toast.noRemainingAmountMsg', { filled: filledText }));
    return;
  }

  const decimals = isPercentage ? 1 : 2;
  const factor = Math.pow(10, decimals);
  const baseShare = Math.floor((remaining / emptyInputs.length) * factor) / factor;
  let accumulated = 0;

  emptyInputs.forEach((input, index) => {
    if (index < emptyInputs.length - 1) {
      input.value = baseShare.toFixed(decimals);
      accumulated += baseShare;
    } else {
      input.value = (Math.round((remaining - accumulated) * factor) / factor).toFixed(decimals);
    }
  });

  updateCustomSplitTotal();
}

function setSplitTypeControl(splitType) {
  currentSplitType = splitType;
  document.querySelectorAll('#splitTypeControl .segmented-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-split-type') === splitType);
  });
  toggleCustomSplitInputs();
}

/**
 * 绑定「全选 / 全不选」checkbox：勾选时把所有参与人都打勾，取消则全部取消
 * 同时监听参与人清单的变化，让「全选」checkbox 反映目前的勾选状态（含 indeterminate 中间态）
 */
function initSelectAllParticipants() {
  document.getElementById('selectAllParticipants').addEventListener('change', (event) => {
    const shouldCheckAll = event.target.checked;

    document.querySelectorAll('#participantList .participant-checkbox').forEach((checkbox) => {
      checkbox.checked = shouldCheckAll;
    });

    toggleCustomSplitInputs();
    updateCustomSplitTotal();
    syncSelectAllState();
  });
}

/**
 * 依目前每位参与人的勾选状态，更新「全选」checkbox 的勾选 / 中间态显示
 */
function syncSelectAllState() {
  const checkboxes = Array.from(document.querySelectorAll('#participantList .participant-checkbox'));
  const selectAll = document.getElementById('selectAllParticipants');

  if (checkboxes.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

/**
 * 渲染参与人清单（checkbox + 分账数值输入框），资料来源为 appState.members
 * 输入框的 placeholder／单位后缀会依目前分账模式（精确金额／百分比／份额）动态调整
 * @param {Object} [selectedCustomSplit] 编辑模式下，预先勾选与填入的分账资料 { name: value }
 * @param {Array<string>} [selectedParticipants] 编辑模式下，预先勾选的参与人名单
 */
function renderParticipantList(selectedCustomSplit, selectedParticipants) {
  const container = document.getElementById('participantList');
  container.innerHTML = '';

  if (appState.members.length === 0) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(t('members.noMembersYet'))}</p>`;
    return;
  }

  appState.members.forEach((name) => {
    const isChecked = selectedParticipants ? selectedParticipants.includes(name) : true;
    const presetValue = selectedCustomSplit && selectedCustomSplit[name] !== undefined
      ? String(selectedCustomSplit[name])
      : '';

    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
      <label class="participant-label">
        <span class="checkbox">
          <input type="checkbox" class="participant-checkbox" value="${escapeHtml(name)}" ${isChecked ? 'checked' : ''}>
          <span class="checkbox-box">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5L10 17.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </span>
        <span class="participant-name">${escapeHtml(name)}</span>
      </label>
      <div class="participant-input-group">
        <input type="number" class="participant-amount-input" data-participant="${escapeHtml(name)}" placeholder="0.00" min="0" step="0.01" value="${escapeHtml(presetValue)}" disabled>
        <span class="participant-input-suffix" data-suffix-for="${escapeHtml(name)}"></span>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.participant-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      toggleCustomSplitInputs();
      updateCustomSplitTotal();
      syncSelectAllState();
    });
  });

  container.querySelectorAll('.participant-amount-input').forEach((input) => {
    input.addEventListener('input', updateCustomSplitTotal);
  });

  toggleCustomSplitInputs();
  syncSelectAllState();
}

/**
 * 依目前分账模式，开启/停用每位参与人的输入框，并调整 placeholder、单位后缀、
 * 工具列（一键均分按钮）的显示方式
 */
function toggleCustomSplitInputs() {
  const needsInput = isValueInputMode();
  const isShares = currentSplitType === 'shares';
  const isPercentage = currentSplitType === 'percentage';
  const rows = document.querySelectorAll('#participantList .participant-row');

  const placeholder = isPercentage ? '0.0' : (isShares ? '1' : '0.00');
  const step = isPercentage ? '0.1' : (isShares ? '0.5' : '0.01');
  const suffixText = isPercentage ? '%' : (isShares ? t('split.shareUnit') : '');

  rows.forEach((row) => {
    const checkbox = row.querySelector('.participant-checkbox');
    const amountInput = row.querySelector('.participant-amount-input');
    const suffixEl = row.querySelector('.participant-input-suffix');
    const isParticipating = checkbox.checked;

    amountInput.disabled = !(needsInput && isParticipating);
    amountInput.placeholder = placeholder;
    amountInput.step = step;
    suffixEl.textContent = isParticipating && needsInput ? suffixText : '';
    row.style.opacity = isParticipating ? '1' : '0.45';

    if (!isParticipating) {
      amountInput.value = '';
    }
  });

  // 「一键均分剩余」按钮：份额模式不需要凑到特定总数，所以隐藏；其余数值模式都显示
  document.getElementById('customSplitToolbar').classList.toggle('is-hidden', !needsInput);
  document.getElementById('fillRemainingBtn').classList.toggle('is-hidden', isShares);
  document.getElementById('customSplitTotal').style.display = needsInput ? 'block' : 'none';

  const hintEl = document.getElementById('customSplitHint');
  if (currentSplitType === 'custom') {
    hintEl.textContent = t('expense.customSplitHint');
  } else if (isPercentage) {
    hintEl.textContent = t('split.percentageHint');
  } else if (isShares) {
    hintEl.textContent = t('split.sharesHint');
  }
}

/**
 * 依目前分账模式即时显示校验文字（已分配 X／总额 Y、已分配 X%／100%、或总份数）
 */
function updateCustomSplitTotal() {
  const totalLabel = document.getElementById('customSplitTotal');

  if (!isValueInputMode()) {
    totalLabel.textContent = '';
    return;
  }

  const inputs = document.querySelectorAll('#participantList .participant-amount-input:not(:disabled)');
  let sum = 0;
  inputs.forEach((input) => {
    sum += parseFloat(input.value) || 0;
  });
  sum = Math.round(sum * 100) / 100;

  if (currentSplitType === 'percentage') {
    const isBalanced = Math.abs(sum - 100) < 0.5;
    totalLabel.textContent = t('split.percentageSummary', { allocated: sum.toFixed(1) });
    totalLabel.classList.toggle('is-balanced', isBalanced);
    totalLabel.classList.toggle('is-unbalanced', !isBalanced);
    return;
  }

  if (currentSplitType === 'shares') {
    const isValid = sum > 0;
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const currency = document.getElementById('expenseCurrency').value;
    const perShareText = isValid ? formatMoney(amount / sum, currency) : formatMoney(0, currency);
    totalLabel.textContent = t('split.sharesSummary', { total: sum, perShare: perShareText });
    totalLabel.classList.toggle('is-balanced', isValid);
    totalLabel.classList.toggle('is-unbalanced', !isValid);
    return;
  }

  // 精确金额模式（沿用旧的 'custom' 内部值）
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  const isBalanced = Math.abs(sum - amount) < AMOUNT_TOLERANCE;
  const currentCurrency = document.getElementById('expenseCurrency').value;

  totalLabel.textContent = t('expense.customSplitSummary', { currency: currentCurrency, allocated: sum.toFixed(2), total: amount.toFixed(2) });
  totalLabel.classList.toggle('is-balanced', isBalanced);
  totalLabel.classList.toggle('is-unbalanced', !isBalanced);
}

function setDefaultExpenseDate() {
  document.getElementById('expenseDate').value = formatDateForInput(new Date());
}

/**
 * 让日期欄位在点击任何位置（不只是日历图示）都会主动跳出原生日期选择器
 * 提升手机与桌面的可点击范围，避免日历图示太小难以点按
 * 若浏览器不支援 showPicker()（例如部分 Safari 版本），会安静地忽略，不影响原本行为
 * @param {string} inputId 日期 input 的 DOM id
 */
function enableEasyDatePicker(inputId) {
  const input = document.getElementById(inputId);
  if (!input || typeof input.showPicker !== 'function') {
    return;
  }

  input.addEventListener('click', () => {
    try {
      input.showPicker();
    } catch (error) {
      // 部分浏览器（例如非使用者手势触发时）会拒绝，安静地忽略即可
    }
  });
}

/**
 * 重置新增消费表单为「新增模式」的初始状态
 */
function resetExpenseForm() {
  editingExpenseId = null;
  document.getElementById('addExpenseTitle').textContent = t('expenseModal.titleAdd');
  document.getElementById('expenseSubmitBtn').querySelector('.btn-label').textContent = t('expenseModal.saveAdd');

  document.getElementById('expenseForm').reset();
  document.getElementById('expenseCurrency').value = appState.tripCurrency.baseCurrency || 'MYR';
  document.getElementById('expenseCurrency').disabled = false; // 编辑金库支出时会锁住，離开表单要还原
  setExpenseCategoryValue_('');
  setDefaultExpenseDate();
  setSplitTypeControl('equal');
  renderParticipantList();
  updateCustomSplitTotal();
  clearReceiptPreview();

  // 资金来源选择器：正常记账／个人消费两项永远都在——个人消费不需要靠金库才能用，
  // 「金库支出」这个选项才是有条件的：只有这趟旅程开了搭伙金库、而且目前还有余额
  // 可以扣，才有得选，否则只隐藏这一颗按钮（隐藏後 flex 布局会自动只分两栏），
  // 不再是整组一起藏。余额是 0 的时候选了也扣不出来，不如直接不给选，充值後
  // isTripSettled 会自动变回 false，下次打开表单就又看得到这个选项了
  const poolAvailable = !!(appState.pool && appState.pool.enabled && !appState.pool.isTripSettled);
  const poolSourceGroup = document.getElementById('poolSourceGroup');
  if (poolSourceGroup) {
    poolSourceGroup.classList.remove('is-hidden');
  }
  const deductSourceBtn = document.querySelector('#expenseSourceControl [data-expense-source="deduct"]');
  if (deductSourceBtn) {
    deductSourceBtn.classList.toggle('is-hidden', !poolAvailable);
  }
  setExpenseSourceControl('normal');

  // 预设带出自己在这趟旅程里的身份（还是可以手动改选，例如帮别人代付时）
  const viewer = getViewerName();
  if (viewer) {
    document.getElementById('expensePayer').value = viewer;
  }

  restoreExpenseDraftIfAny();
}

/**
 * 将表单切换为「编辑模式」，并把指定消费的资料带入表单（含日期）
 * @param {string} expenseId 要编辑的消费 ID
 */
/**
 * 判断一笔金库消费所在的那一轮金库，现在是不是已经结算退余过了——用来判断
 * 「多退少补」还有没有对象可以补：找出这笔消费当初对应的那笔 deduct 交易，
 * 再看同一个货币底下，有没有比它更晚发生的 refund 交易（有的话代表钱已经
 * 在那之後被结清退还过一轮了，这笔消费所在的旧回合已经关账）
 * @param {Object} expense 消费纪录（旧 shape，含 .ID／.Currency）
 * @return {boolean}
 */
function isPoolExpenseSettled_(expense) {
  const transactions = (appState.pool && appState.pool.transactions) || [];
  const deductTx = transactions.find((tx) => tx.type === 'deduct' && tx.expenseId === expense.ID);
  if (!deductTx) return false; // 找不到对应的扣款纪录，交给後端做最终把关，前端先当作还能编辑
  return transactions.some((tx) => tx.type === 'refund' && tx.currency === deductTx.currency
    && new Date(tx.createdAt) > new Date(deductTx.createdAt));
}

function openExpenseFormForEdit(expenseId) {
  const expense = appState.expenses.find((item) => item.ID === expenseId)
    || appState.personalExpenses.find((item) => item.ID === expenseId);
  if (!expense) {
    showToast('error', t('toast.recordNotFound'), t('toast.recordNotFoundMsg'));
    return;
  }

  const isPoolExpense = expense.SplitType === 'pool';

  // 金库支出如果所在那一轮已经结算退余过了，「多退少补」没有对象可以补——
  // 那一轮的余额已经是 0、钱已经实际退给大家了，编辑金额没有意义，只能删除
  // （删除会走 pool_expense_delete() 的「已结算」分支，按人数打散退款）。
  // 这裡先在前端拦一次，不用等後端丢中文错误回来才知道不能编辑
  if (isPoolExpense && isPoolExpenseSettled_(expense)) {
    showToast('error', t('pool.expense.editBlockedSettledTitle'), t('pool.expense.editBlockedSettledMsg'));
    return;
  }

  editingExpenseId = expenseId;
  document.getElementById('addExpenseTitle').textContent = t('expenseModal.titleEdit');
  document.getElementById('expenseSubmitBtn').querySelector('.btn-label').textContent = t('expenseModal.saveEdit');

  // 编辑一定维持原本的资金来源类型，不给切换——正常记账／个人消费／金库支出
  // 这三种编辑时都不给互相切换，选择器直接隐藏，避免使用者以为可以把一笔正常
  // 消费临时改成个人消费（反之亦然）——依 expense.Scope／SplitType 决定要把
  // 欄位配置成哪一种模式
  const poolSourceGroup = document.getElementById('poolSourceGroup');
  if (poolSourceGroup) {
    poolSourceGroup.classList.add('is-hidden');
  }
  setExpenseSourceControl(isPoolExpense ? 'deduct' : (expense.Scope === 'personal' ? 'personal' : 'normal'));

  // 金库支出编辑时货币锁死不能改——货币一换，等於原本那笔扣款要整个撤销、
  // 新货币要重新扣一笔，複杂度/风险都不成比例，要换币别请刪除後重新记一笔
  // （後端 pool_expense_update() 也有同样的限制，这裡只是先在前端把栏位鎖起来，
  // 使用者不会点了才发现改不了）
  const currencySelect = document.getElementById('expenseCurrency');
  if (currencySelect) {
    currencySelect.disabled = isPoolExpense;
  }

  document.getElementById('expensePayer').value = expense.Payer;
  document.getElementById('expenseAmount').value = expense.Amount;
  document.getElementById('expenseCurrency').value = expense.Currency || 'MYR';
  setExpenseCategoryValue_(expense.Category);
  document.getElementById('expenseDescription').value = expense.Description || '';
  document.getElementById('expenseReceipt').value = expense.Receipt || '';
  document.getElementById('expenseRemark').value = expense.Remark || '';
  document.getElementById('expenseDate').value = formatDateForInput(new Date(expense.Date));

  if (expense.Receipt) {
    currentReceiptUrl = expense.Receipt;
    document.getElementById('expenseReceipt').value = expense.Receipt;
    showReceiptPreview(expense.Receipt);
  } else {
    clearReceiptPreview();
  }

  setSplitTypeControl(expense.SplitType);
  renderParticipantList(expense.CustomSplit, expense.Participants);
  updateCustomSplitTotal();

  openModal('addExpenseModal');
}

function collectSelectedParticipants() {
  return Array.from(document.querySelectorAll('.participant-checkbox:checked')).map((cb) => cb.value);
}

function collectCustomSplit() {
  const result = {};
  document.querySelectorAll('.participant-amount-input:not(:disabled)').forEach((input) => {
    result[input.getAttribute('data-participant')] = parseFloat(input.value) || 0;
  });
  return result;
}

/**
 * 新增 / 编辑消费表单送出处理：前端先做基本验证，再呼叫对应 API（含自订日期）
 */
// 防止「同一次送出」被重复触发（例如手机快速点两下、或送出中途又有其他事件
// 再次呼叫这支函式）导致一般消费／金库支出各自被重复写入两笔一模一样的纪录。
// 一般消费本来就有幂等键防「网路重试」造成的重复，但那个机制救不了「本来就
// 独立触发了两次」这种情况——两次呼叫各自会产生不同的幂等键，後端完全看不出
// 是同一个操作。这里在函式最前面直接挡下「上一次还没跑完」的重复呼叫，
// 从源头解决，而不是只针对某一种触发方式修补
let isSubmittingExpense = false;

async function handleExpenseFormSubmit() {
  if (isSubmittingExpense) {
    return; // 已经有一个提交请求在处理中，忽略这次多余的触发
  }
  isSubmittingExpense = true;

  try {
    await handleExpenseFormSubmitInner_();
  } finally {
    isSubmittingExpense = false;
  }
}

async function handleExpenseFormSubmitInner_() {
  // 金库支出：这种消费不需要拆账、不影响成员间的结算，提前分流去呼叫 poolDeduct，
  // 不要往下走一般消费的欄位驗證與 addExpense（这笔钱还是会写进 Expenses 表，
  // 只是 SplitType='pool'，见後端 appendPoolFundedExpenseRow_）。编辑既有的
  // 金库支出走另一支函式（pool_expense_update，多退少补、锁定货币），
  // 靠 editingExpenseId 有没有值分辨这次是新增还是编辑
  if (currentExpenseSource === 'deduct') {
    if (editingExpenseId) {
      await handlePoolFundedExpenseEditSubmit_();
    } else {
      await handlePoolFundedExpenseSubmit_();
    }
    return;
  }

  const payer = document.getElementById('expensePayer').value;
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const currency = document.getElementById('expenseCurrency').value;
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDescription').value.trim();
  const receipt = document.getElementById('expenseReceipt').value.trim();
  const remark = document.getElementById('expenseRemark').value.trim();
  const date = document.getElementById('expenseDate').value;
  const isPersonal = currentExpenseSource === 'personal';
  // 个人消费不跟任何人分账，付款人／参与人都固定是自己（付款人栏位在这个模式下
  // 隐藏、由 setExpenseSourceControl() 自动带出「自己」），不需要使用者手动选，
  // 也不用跑後面「至少选一个参与人」那些跟拆账有关的检查
  const participants = isPersonal ? [payer] : collectSelectedParticipants();

  if (!payer) {
    showToast('error', t('toast.pleaseSelectPayer'), '');
    return;
  }
  if (!category) {
    showToast('error', t('toast.pleaseSelectCategory'), '');
    return;
  }
  if (!amount || amount <= 0) {
    showToast('error', t('toast.amountMustBePositive'), '');
    return;
  }
  if (!isPersonal && participants.length < 1) {
    showToast('error', t('toast.needAtLeastOneParticipant'), '');
    return;
  }
  if (isUploadingReceipt) {
    showToast('error', t('toast.receiptUploading'), t('toast.receiptUploadingMsg'));
    return;
  }

  let customSplit = {};
  // 个人消费模式下分账方式区块是隐藏的，currentSplitType 会停留在
  // resetExpenseForm() 设的初始值 'equal'，不会走进下面这三个分支，
  // 不需要额外用 isPersonal 挡一次
  if (currentSplitType === 'custom') {
    customSplit = collectCustomSplit();
    const sum = Object.values(customSplit).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - amount) > AMOUNT_TOLERANCE) {
      const diffText = formatMoney(Math.abs(amount - sum), currency);
      const mismatchMsg = sum < amount
        ? t('toast.customSplitMismatchMsg', { remaining: diffText })
        : t('toast.customSplitOverMsg', { over: diffText });
      showToast('error', t('toast.customSplitMismatch'), mismatchMsg);
      return;
    }
  } else if (currentSplitType === 'percentage') {
    customSplit = collectCustomSplit();
    const sum = Object.values(customSplit).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 100) > 0.5) {
      showToast('error', t('split.percentageMismatch'), t('split.percentageMismatchMsg', { allocated: sum.toFixed(1) }));
      return;
    }
  } else if (currentSplitType === 'shares') {
    customSplit = collectCustomSplit();
    const sum = Object.values(customSplit).reduce((total, value) => total + value, 0);
    if (sum <= 0 || Object.values(customSplit).some((value) => value <= 0)) {
      showToast('error', t('split.sharesInvalid'), t('split.sharesInvalidMsg'));
      return;
    }
  }

  const submitNow = async () => {
    const payload = {
      tripId: currentTripId,
      date,
      payer,
      amount,
      currency,
      category,
      description,
      splitType: currentSplitType,
      participants,
      customSplit,
      receipt,
      remark,
      scope: isPersonal ? 'personal' : 'group'
    };

    const submitBtn = document.getElementById('expenseSubmitBtn');
    setButtonLoading(submitBtn, true);

    try {
      if (editingExpenseId) {
        const row = translateExpensePayloadForWrite_(payload);
        const { data, error } = await supabaseClient
          .from('expenses')
          .update(row)
          .eq('id', editingExpenseId)
          .select()
          .single();
        if (error) throw error;
        const savedExpense = expenseRowToOldShape_(data);

        rememberLastSplitForPayer(payer, currentSplitType, participants);
        clearExpenseDraft();
        closeModal_('addExpenseModal');
        await refreshAfterExpenseSave(savedExpense, false);
      } else {
        try {
          const row = translateExpensePayloadForWrite_(payload);
          const { data, error } = await supabaseClient
            .from('expenses')
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          const savedExpense = expenseRowToOldShape_(data);

          rememberLastSplitForPayer(payer, currentSplitType, participants);
          clearExpenseDraft();
          closeModal_('addExpenseModal');
          await refreshAfterExpenseSave(savedExpense, true);
        } catch (addError) {
          if (!isNetworkError(addError)) {
            throw addError;
          }

          // 离线：新增消费不像编辑/删除有跟其他人改动冲突的风险，先暂存在这台装置上、
          // 乐观地插进列表显示（标「待同步」徽章），等 initOfflineHandling() 侦测到
          // 恢复连线时由 flushOfflineQueue() 自动补送，不用使用者自己记得再送一次
          const optimisticExpense = queueOfflineExpense(payload);
          if (optimisticExpense.Scope === 'personal') {
            appState.personalExpenses.push(optimisticExpense);
          } else {
            appState.expenses.push(optimisticExpense);
          }

          rememberLastSplitForPayer(payer, currentSplitType, participants);
          clearExpenseDraft();
          closeModal_('addExpenseModal');

          renderDashboard();
          renderExpensesTable();
          updateOfflineBanner();

          showToast('success', t('offline.expenseQueuedTitle'), t('offline.expenseQueuedMsg'));
        }
      }
    } catch (error) {
      showToast('error', t('toast.saveFailed'), error.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  };

  // 这笔消费用的货币要是还没设定汇率、或者汇率已经超过 24 小时没更新（旅程拉长，
  // 汇率会波动，一直沿用第一天抓到的旧值只会越来越不准），先试着自动帮使用者抓一次
  // 即时汇率、直接存起来——不用使用者自己跑一趟设置页手动补
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const rateIsMissing = currency && currency !== baseCurrency && appState.tripCurrency.rates[currency] === undefined;
  const rateIsStale = currency && currency !== baseCurrency && !rateIsMissing && isExchangeRateStale(currency);

  if (rateIsMissing || rateIsStale) {
    const submitBtnForFetch = document.getElementById('expenseSubmitBtn');
    setButtonLoading(submitBtnForFetch, true);

    try {
      const liveRate = await fetchLiveRate_(currency, baseCurrency);
      await saveExchangeRates_({ rates: { [currency]: liveRate.rate } });
      appState.tripCurrency.rates[currency] = liveRate.rate;
      appState.tripCurrency.updatedAt[currency] = new Date().toISOString();
      showToast('success', t('toast.rateAutoFetched'), t('toast.rateAutoFetchedMsg', { currency, rate: liveRate.rate, base: baseCurrency }));
    } catch (error) {
      setButtonLoading(submitBtnForFetch, false);

      if (rateIsMissing) {
        // 完全没有汇率可用，退回用 1:1 之前，一定要让使用者知道、给他选择——
        // 这跟「已经有汇率、只是刷新失败」的严重程度不一样，不能用同样的沉默处理
        openConfirmModal(t('confirm.expenseMissingRateWarning', { currency }), submitNow, {
          title: t('confirm.missingRateTitle'),
          confirmLabel: t('confirm.continueAnyway'),
          danger: false // 只是「先用 1:1 记着，之後会自动校正」，不是危险操作
        });
        return;
      }
      // 只是「刷新」失败，旅程本来就有一个（虽然有点旧但还算数的）汇率可以用，
      // 不用打扰使用者，直接沿用旧汇率继续送出即可
    }

    setButtonLoading(submitBtnForFetch, false);
  }

  await submitNow();
}

/**
 * 记账 Modal 在「金库支出」或「个人代垫归还」模式下的送出处理，取代 handleExpenseFormSubmit
 * 原本的 addExpense 流程——这两种钱不拆账、不写进 Expenses 表，直接呼叫後端
 * poolDeduct／poolReimburse，只动到搭伙金库自己的余额与交易流水
 */
async function handlePoolFundedExpenseSubmit_() {
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const currency = document.getElementById('expenseCurrency').value;
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDescription').value.trim();
  const date = document.getElementById('expenseDate').value;

  if (!amount || amount <= 0) {
    showToast('error', t('toast.amountMustBePositive'), '');
    return;
  }
  if (!currency) {
    showToast('error', t('pool.error.invalidAmount'), '');
    return;
  }

  // 备注优先用使用者填的说明，没填就退回用分类当备注，至少金库交易流水／账目页里
  // 都看得出这笔钱花去哪
  const note = description || category || '';
  const submitBtn = document.getElementById('expenseSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const { error: deductError } = await supabaseClient.rpc('pool_deduct', {
      _trip_id: currentTripId,
      _amount: amount,
      _currency: currency,
      _category: category,
      _note: note,
      _date: date || null
    });
    if (deductError) throw deductError;
    appState.pool = await fetchPoolStatus_();

    clearExpenseDraft();
    closeModal_('addExpenseModal');

    // 这笔钱同时也写进了 expenses 表（split_type='pool'，见 pool_deduct 数据库函数），
    // 「账目」页跟结算总览都要跟着刷新，不能只重画金库卡片
    await refreshExpensesAndSummary();
  } catch (error) {
    showToast('error', t('pool.expense.deductFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 编辑既有金库支出送出处理：金额多退少补，货币锁死不能改（表单栏位本身也
 * disabled 了，这裡再读一次原本的货币，不理会栏位实际的值）。金额变大時
 * 前端先自己算一次「扣掉这笔消费自己原本占用的那份之後，金库还剩多少」，
 * 不够的话直接在这裡拦下来、提示去充值，不用把这个中文错误訊息丟给後端
 * 的 raise exception 再原样显示——那样英文模式下会看到中文
 */
async function handlePoolFundedExpenseEditSubmit_() {
  const expense = appState.expenses.find((item) => item.ID === editingExpenseId);
  if (!expense) {
    showToast('error', t('toast.recordNotFound'), t('toast.recordNotFoundMsg'));
    return;
  }

  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDescription').value.trim();
  const date = document.getElementById('expenseDate').value;

  if (!amount || amount <= 0) {
    showToast('error', t('toast.amountMustBePositive'), '');
    return;
  }

  const currency = expense.Currency;
  const poolCurrency = (appState.pool && appState.pool.currencies || []).find((c) => c.currency === currency);
  const currentBalance = poolCurrency ? poolCurrency.balance : 0;
  // 这笔消费自己原本扣掉的那份，加回目前余额，才是「不算这笔消费」金库真正还有多少
  const balanceExcludingThis = currentBalance + (Number(expense.Amount) || 0);

  if (amount > balanceExcludingThis + AMOUNT_TOLERANCE) {
    const shortfall = formatMoney(amount - balanceExcludingThis, currency);
    showToast('error', t('pool.expense.insufficientBalanceTitle'), t('pool.expense.insufficientBalanceMsg', { amount: shortfall }));
    return;
  }

  const note = description || category || '';
  const submitBtn = document.getElementById('expenseSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const { error } = await supabaseClient.rpc('pool_expense_update', {
      _trip_id: currentTripId,
      _expense_id: editingExpenseId,
      _amount: amount,
      _category: category,
      _note: note,
      _date: date || null
    });
    if (error) throw error;

    appState.pool = await fetchPoolStatus_();

    clearExpenseDraft();
    closeModal_('addExpenseModal');
    await refreshExpensesAndSummary();
  } catch (error) {
    showToast('error', t('pool.expense.editFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

function handleDeleteExpenseClick(expenseId, descriptionText) {
  // 消费详情页（expense-detail）的删除按钮跟编辑按钮不一样：编辑是点了就直接
  // 关页面换页，删除中间隔了一层确认弹窗，不能一点就关（万一使用者按取消，
  // 结果画面已经先跳走了）。所以先记住「删除前是不是正站在详情页」，等真的
  // 删除成功後才补关，取消或失败都不动这个页面
  const wasOnExpenseDetailPage = secondaryPageStack[secondaryPageStack.length - 1] === 'expense-detail';

  openConfirmModal(t('confirm.deleteExpense', { name: descriptionText }), async () => {
    const expense = appState.expenses.find((item) => item.ID === expenseId);

    // 金库支出：删除不是单纯软删除就结束，还要连带处理金库那边的钱——
    // 还没结算的那一轮直接把钱退回余额，已经结算过的那一轮改按现在的成员
    // 人数打散退款，两种都交给 pool_expense_delete() 一次处理完，细节见
    // 该函式的注解
    if (expense && expense.SplitType === 'pool') {
      const { data, error: deleteError } = await supabaseClient.rpc('pool_expense_delete', {
        _trip_id: currentTripId,
        _expense_id: expenseId
      });
      if (deleteError) throw deleteError;

      appState.pool = await fetchPoolStatus_();
      appState.expenses = appState.expenses.filter((item) => item.ID !== expenseId);
      closeActiveModal();
      if (wasOnExpenseDetailPage) {
        closeSecondaryPage_();
      }
      appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
      appState.categorySummary = computeCategorySummaryClient_();
      renderEverything();

      const result = (data || [])[0];
      if (result && result.was_settled) {
        const refunds = [{
          currency: result.currency,
          perPersonAmount: Number(result.per_person_amount) || 0,
          totalAmount: Number(result.total_amount) || 0,
          memberCount: result.member_count
        }];
        showToast('success', t('pool.expense.deleteSettledRefundTitle'), '');
        const posterData = buildPoolRefundPoster_(refunds, appState.members);
        if (posterData && typeof openPoolRefundPoster === 'function') {
          openPoolRefundPoster(posterData);
        }
      } else {
        showToast('success', t('toast.expenseDeleted'), t('pool.expense.deleteRefundedMsg'));
      }
      return;
    }

    const { error } = await supabaseClient
      .from('expenses')
      .update({ deleted: true })
      .eq('id', expenseId);
    if (error) throw error;

    appState.expenses = appState.expenses.filter((item) => item.ID !== expenseId);
    // 这个操作入口现在有两处会触发：账目页的一般消费、同行页自己详情页里的
    // 私人消费（见 bindPersonalExpenseRowActions_）——两个阵列都
    // 顺手一併过滤，一笔消费的 ID 只会存在其中一个，过滤另一个不会有副作用
    appState.personalExpenses = appState.personalExpenses.filter((item) => item.ID !== expenseId);
    showToast('success', t('toast.expenseDeleted'), t('toast.expenseDeletedMsg'));
    closeActiveModal();
    if (wasOnExpenseDetailPage) {
      closeSecondaryPage_();
    }
    appState.summary = sortSummaryAlphabetically(computeSummaryClient_());
    appState.categorySummary = computeCategorySummaryClient_();
    renderDashboard();
    renderExpensesTable();
    renderSummaryPage();
    renderCategorySummary();
    renderCurrencySettings();
    renderMembersPage();
    refreshMemberDetailPageIfOpen_();
  });
}


/* ------------------------------------------------------------
   8B. 收据照片上传
   ------------------------------------------------------------ */

// 上传图片前，若超过此大小会先等比例压缩，避免占用太多 Google Drive 空间与上传时间
const RECEIPT_MAX_DIMENSION_PX = 1600;
const RECEIPT_JPEG_QUALITY = 0.75;

/**
 * 绑定收据方框里唯一的 file input 的变更事件，以及移除按钮
 */
function initReceiptUploader() {
  document.getElementById('receiptFileInput').addEventListener('change', handleReceiptFileSelected);

  document.getElementById('receiptRemoveBtn').addEventListener('click', (event) => {
    // 移除按钮跟 file input 都在同一个方框里、彼此重叠——按钮本身有更高的 z-index，
    // 点击天然就会先给按钮而不是穿透到底下的 input，这里加 stopPropagation 只是
    // 多一层保险，避免任何浏览器的怪癖行为意外把点击也传给 input、跳出选择器
    event.stopPropagation();
    clearReceiptPreview();
  });
}

/**
 * 使用者选好照片后：先在本地做等比例压缩，转成 Base64，再上传到 Backend（Google Drive）
 * @param {Event} event file input 的 change 事件
 */
async function handleReceiptFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // 重置 input，允许使用者重新选同一张照片

  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    showToast('error', t('toast.fileFormatError'), t('toast.fileFormatErrorMsg'));
    return;
  }

  isUploadingReceipt = true;
  updateReceiptUploadHint(t('expense.processingPhoto'));

  try {
    const compressedDataUrl = await compressImageFile(file, RECEIPT_MAX_DIMENSION_PX, RECEIPT_JPEG_QUALITY);

    updateReceiptUploadHint(t('expense.uploadingPhoto'));

    // 路径第一层一定要是 trip id——第 4 步设定的 Storage 权限规则是靠这个判断
    // 「这个人是不是这趟旅程的成员」才准不准上传的
    const path = `${currentTripId}/receipt_${Date.now()}.jpg`;
    const blob = await (await fetch(compressedDataUrl)).blob();

    const { error: uploadError } = await supabaseClient.storage
      .from('receipts')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseClient.storage.from('receipts').getPublicUrl(path);

    currentReceiptUrl = publicUrlData.publicUrl;
    document.getElementById('expenseReceipt').value = publicUrlData.publicUrl;
    showReceiptPreview(compressedDataUrl);
    updateReceiptUploadHint(t('expense.receiptHint'));
    showToast('success', t('toast.photoUploaded'), t('toast.photoUploadedMsg'));
  } catch (error) {
    updateReceiptUploadHint(t('expense.receiptHint'));
    showToast('error', t('toast.uploadFailed'), error.message);
  } finally {
    isUploadingReceipt = false;
  }
}

/**
 * 将图片档案等比例缩放到指定最大边长以内，并转成 JPEG 格式的 Base64 Data URL
 * 目的是避免手机拍照的原始图片（常常好几 MB）拖慢上传速度、占用 Drive 空间
 * @param {File} file 原始图片档案
 * @param {number} maxDimension 长或宽的最大像素
 * @param {number} quality JPEG 压缩品质 (0～1)
 * @return {Promise<string>} 压缩后的 Base64 Data URL
 */
function compressImageFile(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        let { width, height } = image;

        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      image.onerror = () => reject(new Error(t('expense.photoReadError')));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error(t('expense.fileReadError')));
    reader.readAsDataURL(file);
  });
}

/**
 * 显示收据照片预览，并隐藏拍照／选择照片的按钮
 * @param {string} dataUrlOrRemoteUrl 图片来源（本地 Data URL 或远端网址）
 */
function showReceiptPreview(dataUrlOrRemoteUrl) {
  document.getElementById('receiptPreviewImg').src = dataUrlOrRemoteUrl;
  document.getElementById('receiptPreviewImg').classList.remove('is-hidden');
  document.getElementById('receiptUploadIcon').classList.add('is-hidden');
  document.getElementById('receiptRemoveBtn').classList.remove('is-hidden');
}

/**
 * 清除目前的收据照片预览与已上传的网址
 */
function clearReceiptPreview() {
  currentReceiptUrl = '';
  document.getElementById('expenseReceipt').value = '';
  document.getElementById('receiptPreviewImg').src = '';
  document.getElementById('receiptPreviewImg').classList.add('is-hidden');
  document.getElementById('receiptUploadIcon').classList.remove('is-hidden');
  document.getElementById('receiptRemoveBtn').classList.add('is-hidden');
}

/**
 * 更新收据上传区块下方的提示文字
 * @param {string} text 提示文字
 */
function updateReceiptUploadHint(text) {
  const hint = document.getElementById('receiptUploadHint');
  if (hint) {
    hint.textContent = text;
  }
}

/**
 * 消费明细弹窗（所有成员都看得到，不只是记录建立者）里的收据缩图——点一下
 * 开启 receiptViewerModal 看大图。缩图的 src 是 openExpenseDetailModal() 打开
 * 当下就设定好的，这里只要在按钮被点的当下把同一张图丢进 viewer 就好，
 * 不需要额外传参数或重新查一次 expense 资料
 */
function initReceiptViewer() {
  const thumbBtn = document.getElementById('expenseDetailReceiptThumb');
  if (!thumbBtn) {
    return;
  }
  thumbBtn.addEventListener('click', () => {
    const src = document.getElementById('expenseDetailReceiptImg').src;
    if (!src) {
      return;
    }
    document.getElementById('receiptViewerImg').src = src;
    openModal('receiptViewerModal');
  });
}


/* ------------------------------------------------------------
   8C. 智能记忆：记住每位付款人上次选的参与人／分账方式
   ------------------------------------------------------------ */

/**
 * 绑定「付款人」下拉选单的变更事件：新增消费（非编辑模式）时，
 * 自动带入这位付款人上次使用的分账方式与参与人，减少重复勾选
 */
function initSmartMemory() {
  document.getElementById('expensePayer').addEventListener('change', (event) => {
    if (editingExpenseId) {
      return; // 编辑既有消费时，永远显示这笔消费原本的资料，不套用记忆
    }
    applySmartMemoryForPayer(event.target.value);
  });
}

/**
 * 读取指定付款人上次使用的分账方式与参与人，并套用到目前的表单
 * @param {string} payer 付款人姓名
 */
function applySmartMemoryForPayer(payer) {
  const memory = getLastSplitMemory();
  const record = memory[payer];

  if (!record) {
    return;
  }

  setSplitTypeControl(record.splitType || 'equal');
  renderParticipantList(undefined, record.participants);
  updateCustomSplitTotal();
}

/**
 * 记住这位付款人这次使用的分账方式与参与人，下次选到同一位付款人时自动带入
 * @param {string} payer 付款人姓名
 * @param {string} splitType 分账方式
 * @param {Array<string>} participants 参与人名单
 */
function rememberLastSplitForPayer(payer, splitType, participants) {
  const memory = getLastSplitMemory();
  memory[payer] = { splitType, participants };
  localStorage.setItem(STORAGE_KEY_LAST_SPLIT, JSON.stringify(memory));
}

/**
 * 取得目前储存的「付款人 -> 上次分账方式/参与人」记忆物件
 * @return {Object} { payerName: { splitType, participants }, ... }
 */
function getLastSplitMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_LAST_SPLIT)) || {};
  } catch (error) {
    return {};
  }
}


/* ------------------------------------------------------------
   8D. 表单草稿自动暂存 (防丢失)
   ------------------------------------------------------------ */

/**
 * 绑定「新增消费」表单的自动存档：任何栏位变动时（防抖处理），
 * 把目前表单内容存进 localStorage，避免不小心关闭 Modal 弄丢填了一半的资料
 * 只在「新增模式」下运作，编辑既有消费时不会覆写草稿
 */
function initExpenseDraftAutosave() {
  const debouncedSave = debounce(saveExpenseDraft, 400);

  document.getElementById('expenseForm').addEventListener('input', () => {
    if (!editingExpenseId) {
      debouncedSave();
    }
  });
  document.getElementById('expenseForm').addEventListener('change', () => {
    if (!editingExpenseId) {
      debouncedSave();
    }
  });
}

/**
 * 把目前「新增消费」表单的内容存成草稿
 */
function saveExpenseDraft() {
  const draft = {
    tripId: currentTripId,
    payer: document.getElementById('expensePayer').value,
    amount: document.getElementById('expenseAmount').value,
    currency: document.getElementById('expenseCurrency').value,
    category: document.getElementById('expenseCategory').value,
    description: document.getElementById('expenseDescription').value,
    remark: document.getElementById('expenseRemark').value,
    date: document.getElementById('expenseDate').value,
    splitType: currentSplitType,
    participants: collectSelectedParticipants(),
    customSplit: currentSplitType === 'custom' ? collectCustomSplit() : {}
  };

  // 完全空白的草稿不需要存（避免每次打开表单都误判成「有草稿」）
  const isMeaningful = draft.payer || draft.amount || draft.description || draft.participants.length > 0;
  if (!isMeaningful) {
    return;
  }

  localStorage.setItem(STORAGE_KEY_EXPENSE_DRAFT, JSON.stringify(draft));
}

/**
 * 检查是否有属于目前旅程的草稿，若有则还原到表单上，并提示使用者
 */
function restoreExpenseDraftIfAny() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(STORAGE_KEY_EXPENSE_DRAFT));
  } catch (error) {
    draft = null;
  }

  if (!draft || draft.tripId !== currentTripId) {
    return;
  }

  if (draft.payer) document.getElementById('expensePayer').value = draft.payer;
  if (draft.amount) document.getElementById('expenseAmount').value = draft.amount;
  if (draft.currency) document.getElementById('expenseCurrency').value = draft.currency;
  if (draft.category) setExpenseCategoryValue_(draft.category);
  if (draft.description) document.getElementById('expenseDescription').value = draft.description;
  if (draft.remark) document.getElementById('expenseRemark').value = draft.remark;
  if (draft.date) document.getElementById('expenseDate').value = draft.date;

  setSplitTypeControl(draft.splitType || 'equal');
  renderParticipantList(draft.customSplit, draft.participants);
  updateCustomSplitTotal();

  showToast('info', t('draft.restoredToast'), t('draft.restoredMessage'));
}

/**
 * 清除目前储存的表单草稿（成功送出消费后呼叫）
 */
function clearExpenseDraft() {
  localStorage.removeItem(STORAGE_KEY_EXPENSE_DRAFT);
}


/* ------------------------------------------------------------
   9. 新增 / 删除成员
   ------------------------------------------------------------ */

async function handleMemberFormSubmit() {
  const nameInput = document.getElementById('memberName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('error', t('toast.pleaseEnterMemberName'), '');
    return;
  }

  const submitBtn = document.getElementById('memberSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    // 跟旧版一样先在前端挡一次明显重复（真正的最後防线是之後可以加的资料库唯一限制，
    // 这里先用简单版本，重复概率很低——两个人几乎同时新增同名成员才会漏网）
    if (appState.members.includes(name)) {
      throw new Error(t('toast.memberAlreadyExists', { name }));
    }

    const { error } = await supabaseClient
      .from('members')
      .insert({ trip_id: currentTripId, name, nickname: name });
    if (error) throw error;

    nameInput.value = '';
    closeModal_('addMemberModal');
    await refreshMembers();
  } catch (error) {
    showToast('error', t('toast.createFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 检查这个成员在这趟旅程有没有相关（未删除的）消费纪录——有的话不能删除
 * 检查范围刻意只看 Payer / Participants，不看还款纪录
 * @param {string} memberId
 * @return {Promise<boolean>}
 */
async function isMemberInUse_(memberId) {
  const { data, error } = await supabaseClient
    .from('expenses')
    .select('id')
    .eq('trip_id', currentTripId)
    .eq('deleted', false)
    .or(`payer_member_id.eq.${memberId},participants.cs.["${memberId}"]`)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

function handleDeleteMemberClick(name) {
  openConfirmModal(t('confirm.deleteMember', { name }), async () => {
    const memberId = appState.memberIndex && appState.memberIndex.byName[name];
    if (!memberId) {
      throw new Error(t('toast.memberNotFound', { name }));
    }

    if (await isMemberInUse_(memberId)) {
      throw new Error(t('toast.memberInUseCannotDelete', { name }));
    }

    const { error } = await supabaseClient.from('members').delete().eq('id', memberId);
    if (error) throw error;

    showToast('success', t('toast.memberDeleted'), t('toast.memberDeletedMsg', { name }));
    await refreshMembers();
  });
}


/* ------------------------------------------------------------
   9A. 自定义分类管理
   ------------------------------------------------------------ */

/**
 * 重新撈一次分类清单並刷新所有会用到它的画面——新增/改名/隐藏/取消隐藏/删除
 * 分类後呼叫。跟 refreshMembers() 不同：分类不会像成员改名那样「反向」影响
 * 历史消费纪录显示的文字（expense.Category 存的字串本身没变，改的只是这个
 * 分类自己的 meta：icon／is_hidden），不需要连带重新撈 expenses/repayments，
 * 单纯刷新分类清单本身、以及会画出分类清单的那几个地方就够了
 */
async function refreshCategories_() {
  appState.categories = await fetchCategories_();
  renderCategoryFilterChips();
  renderCategorySelectOptions();
  renderCategoryManageList();
  renderCategoryManagePreview_();
}

/**
 * 检查这趟旅程有没有（未删除的）消费纪录在用这个分类——有的话不能直接删除，
 * 只能隐藏。跟 isMemberInUse_() 是同一个模式，只是比对的欄位换成 category
 * @param {string} categoryName
 * @return {Promise<boolean>}
 */
async function isCategoryInUse_(categoryName) {
  const { data, error } = await supabaseClient
    .from('expenses')
    .select('id')
    .eq('trip_id', currentTripId)
    .eq('deleted', false)
    .eq('category', categoryName)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

/**
 * 新增/重命名分类共用的表单送出处理——沿用 renameTripModal 那套「同一个 Modal，
 * 靠 dataset 上有没有存目标 id 分辨是新增还是编辑」的模式（见 handleRenameTripFormSubmit()）。
 * 名称检查会同时挡「跟系统内置分类同名」——不然 translateCategory() 会把这笔自定义
 * 分类誤判成内置分类去查 STRINGS 翻译，两种语言下都会显示翻译後的内置分类文字，
 * 而不是使用者自己输入的原文，违背了当初的设计
 */
async function handleCategoryFormSubmit_() {
  const nameInput = document.getElementById('categoryNameInput');
  const name = nameInput.value.trim();
  const modalEl = document.getElementById('page-add-category');
  const targetCategoryId = modalEl.dataset.targetCategoryId || null;
  const selectedIcon = modalEl.querySelector('.category-icon-option.is-active');
  const iconValue = selectedIcon ? selectedIcon.getAttribute('data-icon-key') : null;

  if (!name) {
    showToast('error', t('toast.pleaseEnterCategoryName'), '');
    return;
  }

  const isBuiltinName = !!CATEGORY_ICON_META[name];
  const isDuplicate = appState.categories.some((category) => {
    if (targetCategoryId && category.id === targetCategoryId) {
      return false; // 编辑中的这一笔，名字没变也不该判定成跟自己重複
    }
    return category.name === name;
  });

  if (isBuiltinName || isDuplicate) {
    showToast('error', t('toast.categoryNameDuplicate'), '');
    return;
  }

  const submitBtn = document.getElementById('categorySubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    if (targetCategoryId) {
      const { error } = await supabaseClient
        .from('categories')
        .update({ name, icon: iconValue })
        .eq('id', targetCategoryId);
      if (error) throw error;
      showToast('success', t('toast.categoryRenamed'), '');
    } else {
      const { error } = await supabaseClient
        .from('categories')
        .insert({ trip_id: currentTripId, created_by: getUserSession().userId, name, icon: iconValue });
      if (error) throw error;
      showToast('success', t('toast.categoryAdded'), '');
    }

    closeModal_('addCategoryModal');
    await refreshCategories_();
  } catch (error) {
    showToast('error', t('toast.actionFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 隐藏／取消隐藏一个自定义分类——隐藏後不再出现在记账表单的分类 pill 裡，
 * 但历史上已经记过的消费纪录不受影响，照常显示（见 renderCategorySelectOptions()
 * 的过滤逻辑）
 * @param {Object} category
 */
async function handleToggleCategoryHiddenClick(category) {
  const nextHidden = !category.isHidden;
  try {
    const { error } = await supabaseClient
      .from('categories')
      .update({ is_hidden: nextHidden })
      .eq('id', category.id);
    if (error) throw error;

    showToast('success', nextHidden ? t('toast.categoryHidden') : t('toast.categoryUnhidden'), '');
    await refreshCategories_();
  } catch (error) {
    showToast('error', t('toast.actionFailed'), error.message);
  }
}

/**
 * 删除一个自定义分类——先照 isMemberInUse_() 的模式检查有没有消费纪录在用，
 * 有的话拒绝删除並提示改用「隐藏」，不是悄悄失败或悄悄允许
 * @param {Object} category
 */
function handleDeleteCategoryClick(category) {
  openConfirmModal(t('confirm.deleteCategory', { name: translateCategory(category.name) }), async () => {
    if (await isCategoryInUse_(category.name)) {
      throw new Error(t('toast.categoryInUseCannotDelete'));
    }

    const { error } = await supabaseClient.from('categories').delete().eq('id', category.id);
    if (error) throw error;

    showToast('success', t('toast.categoryDeleted'), '');
    await refreshCategories_();
  });
}


/* ------------------------------------------------------------
   9B. 还款纪录表单
   ------------------------------------------------------------ */

/**
 * 打开「记录还款」Modal 的统一入口：先检查旅程是否选定、是否有货币尚未设定汇率
 * （安全拦截），确认没问题后才真正开启 Modal
 * @param {{from?: string, to?: string, amount?: number}} [prefill] 预先带入的还款人／收款人／金额
 */
/**
 * 把「记录还款」表单清空回初始状态——勾选框全部取消、金额欄位清空并停用、
 * 收款人下拉收回「请选择」。每次打开这个表单前都要先呼叫，不然如果上一次
 * 是「点了某笔建议还款、勾了还款人、又按取消」，上一次勾的还款人会一直
 * 留在表单上，這次重新点開別的建議时只有收款人被换掉，还款人却是舊資料
 * 疊上去，兩筆资料对不起来
 */
function resetRepaymentForm() {
  document.querySelectorAll('#repaymentFromList .repayment-from-checkbox').forEach((checkbox) => {
    checkbox.checked = false;
  });
  document.querySelectorAll('#repaymentFromList .repayment-from-amount').forEach((input) => {
    input.value = '';
    input.disabled = true;
  });
  const toSelect = document.getElementById('repaymentTo');
  if (toSelect) {
    toSelect.value = '';
  }
  updateRepaymentFromTotal();
  syncRepaymentSelectAllState();
}

function openAddRepaymentModal(prefill) {
  if (!currentTripId) {
    showToast('error', t('toast.pleaseSelectTrip'), t('toast.pleaseSelectTripForRepayment'));
    return;
  }

  const missingCurrencies = getMissingExchangeRateCurrencies();
  if (missingCurrencies.length > 0) {
    openConfirmModal(
      t('confirm.missingRateWarning', { currencies: missingCurrencies.join('、') }),
      async () => {
        closeActiveModal();
        openModal('addRepaymentModal');
        resetRepaymentForm();
        applyRepaymentPrefill(prefill);
      },
      {
        title: t('confirm.missingRateTitle'),
        confirmLabel: t('confirm.continueAnyway'),
        danger: false
      }
    );
    return;
  }

  openModal('addRepaymentModal');
  resetRepaymentForm();
  applyRepaymentPrefill(prefill);
}

/**
 * 从「建议还款」列表点击「去还款」时呼叫：打开还款表单，并直接带入这笔建议的 from / to / amount
 * @param {string} from 还款人
 * @param {string} to 收款人
 * @param {number} amount 金额
 */
function openRepaymentModalPrefilled(from, to, amount) {
  openAddRepaymentModal({ from, to, amount });
}

/**
 * 把预填资料实际套用到还款表单上（勾选还款人 checkbox、填金额、选收款人）
 * @param {{from?: string, to?: string, amount?: number}} [prefill]
 */
function applyRepaymentPrefill(prefill) {
  if (!prefill) {
    return;
  }

  if (prefill.to) {
    document.getElementById('repaymentTo').value = prefill.to;
  }

  if (prefill.from) {
    const checkbox = document.querySelector(`#repaymentFromList .repayment-from-checkbox[value="${CSS.escape(prefill.from)}"]`);
    if (checkbox) {
      checkbox.checked = true;
      const amountInput = document.querySelector(`.repayment-from-amount[data-member="${CSS.escape(prefill.from)}"]`);
      amountInput.disabled = false;
      if (prefill.amount) {
        amountInput.value = Number(prefill.amount).toFixed(2);
      }
      updateRepaymentFromTotal();
      syncRepaymentSelectAllState();
    }
  }
}

/**
 * 绑定「记录还款」表单的送出事件
 */
function initRepaymentForm() {
  document.getElementById('repaymentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    handleRepaymentFormSubmit();
  });
}

/**
 * 设定还款表单中「日期」栏位的预设值为今天
 */
function setDefaultRepaymentDate() {
  document.getElementById('repaymentDate').value = formatDateForInput(new Date());
}

/**
 * 依 appState.members 渲染「还款人 / 收款人」下拉选单
 */
function renderRepaymentSelectOptions() {
  const toSelect = document.getElementById('repaymentTo');
  const currentToValue = toSelect.value;

  toSelect.innerHTML = `<option value="" disabled selected>${escapeHtml(t('repayment.selectMember'))}</option>`;
  appState.members.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    toSelect.appendChild(option);
  });

  if (appState.members.includes(currentToValue)) {
    toSelect.value = currentToValue;
  }

  renderRepaymentFromList();
}

/**
 * 绑定「还款人」清单上方的「全选 / 全不选」checkbox
 */
function initSelectAllRepaymentFrom() {
  document.getElementById('selectAllRepaymentFrom').addEventListener('change', (event) => {
    const shouldCheckAll = event.target.checked;

    document.querySelectorAll('#repaymentFromList .repayment-from-checkbox').forEach((checkbox) => {
      checkbox.checked = shouldCheckAll;
      const amountInput = document.querySelector(`.repayment-from-amount[data-member="${CSS.escape(checkbox.value)}"]`);
      amountInput.disabled = !shouldCheckAll;
      if (!shouldCheckAll) {
        amountInput.value = '';
      }
    });

    updateRepaymentFromTotal();
  });
}

/**
 * 依目前每位还款人的勾选状态，更新「全选」checkbox 的勾选 / 中间态显示
 */
function syncRepaymentSelectAllState() {
  const checkboxes = Array.from(document.querySelectorAll('#repaymentFromList .repayment-from-checkbox'));
  const selectAll = document.getElementById('selectAllRepaymentFrom');

  if (checkboxes.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

/**
 * 渲染「还款人」的可勾选清单，每个人都有独立的金额输入框
 * 用于多人合并还款的情境（例如夫妻其中一人一次转账，帮两人一起还款）
 */
function renderRepaymentFromList() {
  const container = document.getElementById('repaymentFromList');
  container.innerHTML = '';

  if (appState.members.length === 0) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(t('members.noMembersYet'))}</p>`;
    return;
  }

  appState.members.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
      <label class="participant-label">
        <span class="checkbox">
          <input type="checkbox" class="repayment-from-checkbox" value="${escapeHtml(name)}">
          <span class="checkbox-box">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5L10 17.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </span>
        <span class="participant-name">${escapeHtml(name)}</span>
      </label>
      <input type="number" class="participant-amount-input repayment-from-amount" data-member="${escapeHtml(name)}" placeholder="0.00" min="0" step="0.01" disabled>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.repayment-from-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const amountInput = container.querySelector(`.repayment-from-amount[data-member="${CSS.escape(checkbox.value)}"]`);
      amountInput.disabled = !checkbox.checked;
      if (!checkbox.checked) {
        amountInput.value = '';
      }
      updateRepaymentFromTotal();
      syncRepaymentSelectAllState();
    });
  });

  container.querySelectorAll('.repayment-from-amount').forEach((input) => {
    input.addEventListener('input', updateRepaymentFromTotal);
  });

  updateRepaymentFromTotal();
  syncRepaymentSelectAllState();
}

/**
 * 更新「还款人」清单下方的合计提示文字（即时加总所有已勾选成员填写的金额）
 */
function updateRepaymentFromTotal() {
  const hint = document.getElementById('repaymentFromTotal');
  const checkedInputs = document.querySelectorAll('#repaymentFromList .repayment-from-amount:not(:disabled)');

  let sum = 0;
  let count = 0;
  checkedInputs.forEach((input) => {
    const value = parseFloat(input.value) || 0;
    if (value > 0) {
      count += 1;
    }
    sum += value;
  });

  hint.textContent = count > 0 ? t('repayment.checkedTotal', { count, total: formatMoney(sum) }) : '';
}

/**
 * 「记录还款」表单送出处理
 * 支援一次勾选多位还款人、各自填写金额，会拆成多笔独立的还款纪录送出
 */
async function handleRepaymentFormSubmit() {
  const toMember = document.getElementById('repaymentTo').value;
  const date = document.getElementById('repaymentDate').value;
  const remark = document.getElementById('repaymentRemark').value.trim();

  const entries = [];
  document.querySelectorAll('#repaymentFromList .repayment-from-checkbox:checked').forEach((checkbox) => {
    const fromMember = checkbox.value;
    const amountInput = document.querySelector(`.repayment-from-amount[data-member="${CSS.escape(fromMember)}"]`);
    const amount = parseFloat(amountInput.value);
    entries.push({ fromMember, amount });
  });

  if (!toMember) {
    showToast('error', t('toast.pleaseSelectRecipient'), '');
    return;
  }
  if (entries.length === 0) {
    showToast('error', t('toast.pleaseCheckOneRepayer'), '');
    return;
  }
  if (entries.some((entry) => entry.fromMember === toMember)) {
    showToast('error', t('toast.repayerSameAsRecipient'), t('toast.repayerSameAsRecipientMsg', { name: toMember }));
    return;
  }
  if (entries.some((entry) => !entry.amount || entry.amount <= 0)) {
    showToast('error', t('toast.repayerAmountRequired'), '');
    return;
  }

  const submitBtn = document.getElementById('repaymentSubmitBtn');
  setButtonLoading(submitBtn, true);

  try {
    const { error } = await supabaseClient.from('repayments').insert(
      entries.map((entry) => translateRepaymentPayloadForWrite_({
        fromMember: entry.fromMember,
        toMember,
        amount: entry.amount,
        date,
        remark,
        isNew: true
      }))
    );
    if (error) throw error;

    document.getElementById('repaymentForm').reset();
    setDefaultRepaymentDate();
    renderRepaymentFromList();
    closeModal_('addRepaymentModal');
    await refreshRepayments();
  } catch (error) {
    showToast('error', t('toast.saveFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * 「一键结清」：把目前所有建议还款，一次性转成正式的还款纪录
 * 沿用 handleRepaymentFormSubmit 同样的 Promise.all 模式平行送出多笔 addRepayment，
 * 后端已经把「产生 ID + 写入该列」包在同一把锁里（见 generateIdAndAppendRow），
 * 所以平行送出多笔请求是安全的，不会有两笔纪录抢到同一个 ID 的问题
 */
function handleSettleAllClick() {
  // 跟「搭伙金库」这个虚拟结算参与者有关的转账建议不能真的去记一笔还款——它不是
  // 真实成员，写入 Repayments 表会因为找不到对应的 MemberID 而失败，这里先滤掉，
  // 只对真人对真人的转账批次建立还款纪录
  const settlements = (appState.summary.settlements || []).filter((item) => !item.isPoolSettlement);

  if (settlements.length === 0) {
    return;
  }

  const total = settlements.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  openConfirmModal(t('settlement.settleAllConfirm', { count: settlements.length, total: formatMoney(total) }), async () => {
    const today = formatDateForInput(new Date());

    const { error } = await supabaseClient.from('repayments').insert(
      settlements.map((item) => translateRepaymentPayloadForWrite_({
        fromMember: item.from,
        toMember: item.to,
        amount: item.amount,
        date: today,
        remark: t('settlement.markAsPaid'),
        isNew: true
      }))
    );
    if (error) throw error;

    showToast('success', t('settlement.settleAllSuccess'), t('settlement.settleAllSuccessMsg', { count: settlements.length }));
    await refreshRepayments();
  }, {
    title: t('confirm.settleAllTitle'),
    confirmLabel: t('confirm.settleAllLabel'),
    danger: false // 结清不是删除/危险操作，改用一般强调色按钮，不要吓到人
  });
}

/**
 * 初始化「结算」页的「一键结清」按钮（静态元素，只需要绑定一次）
 */
function initSettleAllButton() {
  const button = document.getElementById('settleAllBtn');
  if (button) {
    button.addEventListener('click', handleSettleAllClick);
  }
}

/**
 * 处理删除还款纪录的按钮点击：打开确认 Modal，确认后呼叫 deleteRepayment
 * @param {string} repaymentId 还款纪录 ID
 * @param {string} label 显示在确认文字中的说明（例如 "John → Wei"）
 */
function handleDeleteRepaymentClick(repaymentId, label) {
  openConfirmModal(t('confirm.deleteRepayment', { name: label }), async () => {
    const { error } = await supabaseClient
      .from('repayments')
      .update({ deleted: true })
      .eq('id', repaymentId);
    if (error) throw error;
    showToast('success', t('toast.repaymentDeleted'), t('toast.repaymentDeletedMsg'));
    await refreshRepayments();
  });
}


/* ------------------------------------------------------------
   10. 渲染：Dashboard
   ------------------------------------------------------------ */

function renderDashboard() {
  togglePageEmptyHero_('dashEmptyHero', 'dashNormalContent', false);

  renderWelcomeBanner();
  renderDashboardHeader();
  renderHeroCard();
  checkPoolLowBalanceAlert();

  // 这趟旅程完全没有任何消费纪录的话，「谁欠谁」「近期账目」两个面板都不会
  // 有东西可以显示——与其各自放一个小空状态，不如直接换成一整块「还没有
  // 消费纪录」的引导，Hero Card／快速操作还是留着，只是底下这段换掉
  const noExpensesBlock = document.getElementById('dashNoExpensesBlock');
  const dataSection = document.getElementById('dashTripDataSections');
  const hasNoExpenses = appState.expenses.length === 0;
  if (noExpensesBlock) noExpensesBlock.style.display = hasNoExpenses ? '' : 'none';
  if (dataSection) dataSection.style.display = hasNoExpenses ? 'none' : '';

  if (!hasNoExpenses) {
    renderBalanceMatrix();
    renderRecentActivity();
  }
}

/**
 * 依現在的本機时间决定要用哪一句问候语：
 *   5-11 点早上好、12-17 点下午好、18-22 点晚上好、23 点到隔天 4 点夜深了。
 * @return {string} STRINGS 里对应的 key（还没套用语言，t() 会在呼叫端处理）
 */
function getGreetingKey_() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'dashboard.greeting.morning';
  if (hour >= 12 && hour < 18) return 'dashboard.greeting.afternoon';
  if (hour >= 18 && hour < 23) return 'dashboard.greeting.evening';
  return 'dashboard.greeting.night';
}

/**
 * 渲染 Dashboard 页最上面的欢迎词，用登入账号的显示名称打招呼
 */
function renderWelcomeBanner() {
  const el = document.getElementById('dashWelcomeText');
  if (!el) {
    return;
  }

  const session = getUserSession();
  el.textContent = session && session.displayName
    ? t('dashboard.welcomeBack', { greeting: t(getGreetingKey_()), name: session.displayName })
    : '';
}

/**
 * 渲染 Dashboard 头部：旅程标题、建立日期/基准货币、头像堆叠
 */
function renderDashboardHeader() {
  const trip = (appState.trips || []).find((item) => item.id === currentTripId);

  const titleEl = document.getElementById('dashTripTitle');
  if (titleEl) {
    const newTitle = trip ? trip.name : t('trip.noTripSelected');
    revealTripHeaderText(titleEl, newTitle);
  }

  const metaEl = document.getElementById('dashTripMeta');
  if (metaEl) {
    const newMeta = trip
      ? t('dashboard.tripMetaCreated', {
          date: formatDateDisplay(trip.createdAt),
          currency: (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR'
        })
      : '';
    revealTripHeaderText(metaEl, newMeta);
  }

  // 标题旁边那颗铅笔按钮固定语义是「改这趟旅程的名字」（点了直接开 renameTripModal，
  // 见 index.html 上的 data-open-modal），aria-label 要跟着语言切换更新——
  // 做法比照下面 Hero Card 吉祥物按钮那颗动态 aria-label，不能只在 index.html
  // 写死一份，不然换语言後文字就跟画面其他地方对不上
  const switchTripBtn = document.getElementById('dashSwitchTripBtn');
  if (switchTripBtn) {
    switchTripBtn.setAttribute('aria-label', t('renameTripModal.title'));
  }

  renderAvatarStack();
}

/**
 * 头像堆叠：最多显示 4 个成员的姓名缩写，超过的用「+N」收尾；
 * 堆叠最後固定接一颗「切换旅程」按钮，图示改用双向箭头而不是铅笔——
 * 铅笔已经被旅程标题旁边那颗按钮专用来表示「改名」，两个不同动作不能共用同一个图示，
 * 不然使用者会分不清楚点下去到底是要改名字还是要换旅程
 */
function renderAvatarStack() {
  const container = document.getElementById('avatarStack');
  if (!container) return;

  const members = appState.members || [];
  const MAX_VISIBLE = 4;
  const visible = members.slice(0, MAX_VISIBLE);
  const remaining = members.length - visible.length;

  const membersHtml = visible.map((name) =>
    `<div class="avatar" title="${escapeHtml(name)}">${escapeHtml(getInitials(name))}</div>`
  ).join('') + (remaining > 0 ? `<div class="avatar-stack-more">+${remaining}</div>` : '');

  // 靠通用的 [data-open-modal] 委派监听器打开 tripPickerModal（见 initModals()
  // 里对 'tripPickerModal' 的特判，负责在开启前先重新渲染一次清单）；这颗按钮
  // 每次都是随 innerHTML 重新产生，不能用「先 getElementById 再 addEventListener」
  // 那种绑法，不然重渲染一次监听器就掉了
  const switchTripBtnHtml = `
    <button type="button" class="avatar-stack-switch-btn" id="avatarStackSwitchTripBtn" data-open-modal="tripPickerModal" aria-label="${escapeHtml(t('fab.switchTrip'))}">
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 8h12m0 0l-4-4m4 4l-4 4M19 16H7m0 0l4-4m-4 4l4 4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `;

  container.innerHTML = membersHtml + switchTripBtnHtml;
}

/**
 * 切换文字内容时先淡出、换字後再淡入（配合 style.css 的 .is-text-swapping），
 * 内容没变就不用跑动画
 * @param {HTMLElement} el
 * @param {string} newText
 */
function animateTripHeaderTextSwap(el, newText) {
  if (!el || el.textContent === newText) return;
  el.classList.add('is-text-swapping');
  window.setTimeout(() => {
    el.textContent = newText;
    el.classList.remove('is-text-swapping');
  }, 220);
}

function revealTripHeaderText(el, newText) {
  animateTripHeaderTextSwap(el, newText);
}

/**
 * Hero Card：登入账号在这趟旅程里的个人净额总览（预计收回/需付、已付金额、
 * 个人消费、已还款或已收金额）——找不到「你是谁」就显示空状态
 */
function renderHeroCard() {
  const emptyState = document.getElementById('heroEmptyState');
  const content = document.getElementById('heroContent');
  if (!emptyState || !content) return;

  const viewerName = getViewerName();
  const balances = (appState.summary && appState.summary.balances) || [];
  const item = viewerName ? balances.find((b) => b.name === viewerName) : null;

  if (!viewerName || !item) {
    renderEmptyBlock('heroEmptyState', t('hero.noViewerTitle'), t('hero.noViewerDesc'));
    emptyState.classList.remove('is-hidden');
    content.classList.add('is-hidden');
    content.classList.remove('is-skeleton');
    syncDashCardHeights();
    return;
  }

  // 有连结成员身份，但这趟旅程还没有任何消费纪录——这跟「结清了」不一样，
  // 不该让 Hero Card 显示一堆 MYR 0.00（看起来像是有过账目、只是刚好扯平），
  // 沿用同一个空状态框架、换一组「还没有消费纪录」的文案
  if (appState.expenses.length === 0) {
    renderEmptyBlock('heroEmptyState', t('empty.noExpenses.title'), t('empty.noExpenses.desc'));
    emptyState.classList.remove('is-hidden');
    content.classList.add('is-hidden');
    content.classList.remove('is-skeleton');
    syncDashCardHeights();
    return;
  }

  emptyState.classList.add('is-hidden');
  content.classList.remove('is-hidden');
  content.classList.remove('is-skeleton');

  const isOwed = item.balance > AMOUNT_TOLERANCE;
  const isOwing = item.balance < -AMOUNT_TOLERANCE;

  const netValueEl = document.getElementById('heroNetValue');
  if (netValueEl) {
    netValueEl.textContent = formatMoney(Math.abs(item.balance));
    netValueEl.classList.toggle('is-owed', isOwed);
    netValueEl.classList.toggle('is-owing', isOwing);
  }

  const netLabelEl = document.getElementById('heroNetLabel');
  if (netLabelEl) {
    netLabelEl.textContent = isOwed ? t('hero.receivableLabel') : (isOwing ? t('hero.payableLabel') : t('hero.settledLabel'));
  }

  // Hero Card 的吉祥物互动跟金库卡片同一套手感：状态决定要显示哪一组文案，
  // 点一下（onHeroMascotTap）再换成同一组里的下一句 + 弹跳动画
  const heroStatus = isOwed ? 'receivable' : (isOwing ? 'payable' : 'settled');
  const heroMascotBtn = document.querySelector('#heroContent .hero-mascot');
  if (heroMascotBtn) {
    heroMascotBtn.setAttribute('aria-label', t('hero.mascot.ariaLabel'));
  }
  const heroMascotCopyEl = document.getElementById('heroMascotCopy');
  if (heroMascotCopyEl) {
    heroMascotCopyEl.textContent = getHeroMascotCopy(heroStatus);
  }

  // 已付金额／个人消费／已收金额，要跟 PDF 报告的算法完全一致（消费付出全额 + 登记打款进
  // 金库的预付款 + 另外还给别人的还款；个人消费额外加上金库支出的均摊份额；已收金额额外
  // 加上金库结程退余的均摊份额），两处数值才不会对不上。金库户口的外币一律免换算，
  // 多币种时按币种分别累加并列显示（如「MYR 1,000.00 + CNY 500.00」）。份摊只算
  // viewerName「加入这趟旅程之後」发生的交易，见 computeMemberPoolShares_ 的说明
  const baseCurrency = (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR';
  const poolShares = computeMemberPoolShares_(viewerName);
  const poolTopupBreakdown = poolShares.topupBreakdown;
  const poolConsumptionBreakdown = poolShares.consumptionBreakdown;
  const poolRefundBreakdown = poolShares.refundBreakdown;

  const frontedBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.paid + (item.repaid || 0), poolTopupBreakdown);
  const personalBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.shouldPay, poolConsumptionBreakdown);

  const frontedEl = document.getElementById('heroFrontedValue');
  if (frontedEl) frontedEl.textContent = formatCurrencyBreakdownText(frontedBreakdown);

  const personalEl = document.getElementById('heroPersonalValue');
  if (personalEl) personalEl.textContent = formatCurrencyBreakdownText(personalBreakdown);

  // Hero Card 固定只显示三格：已付金额／个人消费／已收金额——不再依「你是该收钱还是该
  // 还钱的人」切换第三格的标签／数值（旧版欠钱时会改显示「已还款」），统一固定呈现
  // 「已收金额」＝别人还给你的钱 + 金库结程退余的均摊份额
  const receivedEl = document.getElementById('heroReceivedValue');
  if (receivedEl) {
    const receivedBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.received, poolRefundBreakdown);
    receivedEl.textContent = formatCurrencyBreakdownText(receivedBreakdown);
  }

  syncDashCardHeights();
}

function renderHeroCardSkeleton() {
  const content = document.getElementById('heroContent');
  const emptyState = document.getElementById('heroEmptyState');
  if (!content) return;
  if (emptyState) emptyState.classList.add('is-hidden');
  content.classList.remove('is-hidden');
  content.classList.add('is-skeleton');
}

function renderDashboardHeaderSkeleton() {
  const titleEl = document.getElementById('dashTripTitle');
  const metaEl = document.getElementById('dashTripMeta');
  if (titleEl) titleEl.textContent = '···';
  if (metaEl) metaEl.textContent = '';
}

/**
 * 旅程切换/重新载入期间，用骨架屏顶著 Dashboard 头部与 Hero Card，
 * 避免中途出现一片空白
 */
function renderDashboardSkeleton() {
  renderDashboardHeaderSkeleton();
  renderHeroCardSkeleton();
}

/**
 * 载入失败时，把 Hero Card 从骨架屏状态收回空状态（而不是让骨架屏一直转下去）
 */
function clearHeroCardSkeletonToEmpty_() {
  const content = document.getElementById('heroContent');
  const emptyState = document.getElementById('heroEmptyState');
  if (content) {
    content.classList.remove('is-skeleton');
    content.classList.add('is-hidden');
  }
  if (emptyState) emptyState.classList.remove('is-hidden');
}

/**
 * 把「谁欠谁」的展开/收起按钮藏起来——空状态／错误状态下没有清单可以展开，不需要显示
 */
function hideBalanceMatrixToggle() {
  const toggleBtn = document.getElementById('balanceMatrixToggleBtn');
  if (toggleBtn) toggleBtn.classList.add('is-hidden');
}

/**
 * 「谁欠谁」：依最少交易结算建议（appState.summary.settlements）列出每一对应该
 * 转账的关系，跟登入账号有关的那几笔会换成「XX 需要转给你」/「你需要转给 XX」
 * 的第一人称说法，其他人之间的欠款则显示「A 需要转给 B」
 */
function renderBalanceMatrix() {
  const allSettlements = (appState.summary && appState.summary.settlements) || [];
  const container = document.getElementById('balanceMatrixList');
  const toggleBtn = document.getElementById('balanceMatrixToggleBtn');
  const panel = document.getElementById('balanceMatrixPanel');
  if (!container) return;

  // 只显示跟登入账号有关的那几笔（自己该付给谁、该跟谁收），不是「所有人跟所有人」
  // 的还款建议——理由跟结算页面的「谁欠谁」清单一样，见 renderSummaryPage 的说明
  const viewerName = getViewerName();
  const settlements = allSettlements.filter((item) => item.from === viewerName || item.to === viewerName);

  if (settlements.length === 0) {
    // 不管是「还没有消费」还是「都已经结清」，这个 section 本来就是拿来提示
    // 「该转帐给谁」用的——没有要转帐的对象，放一个空状态占位置没有意义，
    // 直接整块藏起来，跟结算页面「最优结算」结清後隐藏是同一个道理
    if (panel) panel.classList.add('is-hidden');
    return;
  }
  if (panel) panel.classList.remove('is-hidden');

  const MAX_COLLAPSED = 3;
  const isLong = settlements.length > MAX_COLLAPSED;
  const collapsedList = isLong ? settlements.slice(0, MAX_COLLAPSED) : settlements;

  const renderRow = (item) => {
    const isYouOwe = viewerName && item.from === viewerName;
    const isOwesYou = viewerName && item.to === viewerName;
    // 头像／名字都要显示「对方」，不是自己——youOwe 时 item.from 其实是自己
    // （viewerName），旧版这裡一律显示 getInitials(item.from) 在这个情境下
    // 会画出自己的头像，是个小 bug，这次一并修正
    const counterpartRaw = isOwesYou ? item.from : item.to;
    const counterpartDisplay = getExpensePayerDisplay(counterpartRaw);
    const relationSub = isOwesYou
      ? t('dashboard.matrix.owesYouSub')
      : isYouOwe
        ? t('dashboard.matrix.youOweSub')
        : t('dashboard.matrix.otherPairSub');

    // 跟「搭伙金库」有关的转账建议不是真人对真人，不提供「提醒」按钮
    // （金库不会看 WhatsApp，提醒了也没有意义）
    const showRemindBtn = !isYouOwe && !item.isPoolSettlement;

    // 「提醒」原本是行尾独立一栏的圆形图示按钮，不管这一行能不能提醒都要
    // 佔同样宽度（见 is-invisible 占位），在窄手机屏幕上会跟姓名栏抢空间。
    // 改成金额栏底下的小文字连结，跟金额同一栏垂直堆叠、不再多佔一栏横向
    // 空间；不能提醒的行（自己欠对方／金库相关）就直接不渲染这行连结，
    // 不需要占位撑对齐，行会自然矮一截，也顺便区分出「这行能不能提醒」
    return `
      <div class="balance-row">
        <div class="avatar">${escapeHtml(getInitials(counterpartRaw))}</div>
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(counterpartDisplay)}</p>
          <p class="balance-sub">${escapeHtml(relationSub)}</p>
        </div>
        <div class="balance-row-end">
          <p class="balance-amount mono">${formatMoney(item.amount)}</p>
          ${showRemindBtn ? `
          <button class="balance-matrix-remind-link" type="button"
            data-remind-name="${escapeHtml(item.from)}" data-remind-amount="${item.amount}">
            ${escapeHtml(t('dashboard.matrix.remind'))}
          </button>` : ''}
        </div>
      </div>
    `;
  };

  let expanded = false;
  const paint = () => {
    container.innerHTML = (expanded ? settlements : collapsedList).map(renderRow).join('');
    bindBalanceMatrixRemindButtons_();
  };
  paint();

  if (toggleBtn) {
    if (isLong) {
      toggleBtn.classList.remove('is-hidden');
      toggleBtn.textContent = t('dashboard.viewAll');
      toggleBtn.onclick = () => {
        expanded = !expanded;
        toggleBtn.textContent = expanded ? t('dashboard.matrix.collapse') : t('dashboard.viewAll');
        paint();
      };
    } else {
      toggleBtn.classList.add('is-hidden');
    }
  }
}

/**
 * 「谁欠谁」每一行的「提醒」按钮：组好提醒文字，装置支援分享面板就用分享，
 * 不支援就复制到剪贴板，让使用者自己贴去 WhatsApp/Line 之类的地方发送。
 * 讯息里现在会带一个「?invite=邀请码」的连结——对方点进来，App 会自动帮他
 * 切到注册分页、邀请码也预填好，他就能自己开账号、看这趟旅程实际花在哪，
 * 不用只凭一句「你还欠多少钱」的文字乾等着被催
 */
function bindBalanceMatrixRemindButtons_() {
  document.querySelectorAll('.balance-matrix-remind-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-remind-name');
      const amount = Number(btn.getAttribute('data-remind-amount')) || 0;
      const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(appState.inviteCode || '')}`;
      const message = t('dashboard.matrix.reminderText', { name, amount: formatMoney(amount), link: inviteLink });

      if (navigator.share) {
        navigator.share({ text: message }).catch(() => {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message);
        showToast('success', t('invite.copiedTitle'), '');
      }
    });
  });
}

/**
 * 近期账目：只精选最近 3 笔消费，单行极简呈现，点击可以打开完整明细
 */
function renderRecentActivity() {
  const recent = [...(appState.expenses || [])]
    .sort((a, b) => new Date(b.Date) - new Date(a.Date))
    .slice(0, 3);

  if (recent.length === 0) {
    renderEmptyBlock('recentActivityList', t('empty.noExpenses.title'), t('empty.noExpenses.desc'), 'addExpenseModal', t('header.addExpense'));
    return;
  }

  const container = document.getElementById('recentActivityList');
  if (!container) return;

  container.innerHTML = recent.map((expense) => {
    const iconMeta = getCategoryIconMeta(expense.Category);
    return `
      <div class="activity-row" data-expense-id="${escapeHtml(expense.ID)}" role="button" tabindex="0">
        <div class="activity-icon ${iconMeta.cls}" aria-hidden="true">${iconMeta.svg}</div>
        <div class="activity-info">
          <p class="activity-title">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
          <p class="activity-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))}</p>
        </div>
        <p class="activity-amount mono">${formatExpenseAmountDisplay(expense)}</p>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-expense-id]').forEach((row) => {
    row.addEventListener('click', () => openExpenseDetailModal(row.getAttribute('data-expense-id')));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openExpenseDetailModal(row.getAttribute('data-expense-id'));
      }
    });
  });
}

/**
 * 绑定 Dashboard「快速操作」按钮：最优结算带去结算页看最少交易建议；
 * 账单统计打开分类消费总览 Modal
 */
function initQuickActionsDock() {
  const settleBtn = document.getElementById('qaSettleBtn');
  if (settleBtn) {
    settleBtn.addEventListener('click', () => openSettlementSuggestionsModal());
  }

  const statsBtn = document.getElementById('qaStatsBtn');
  if (statsBtn) {
    statsBtn.addEventListener('click', () => openCategoryStatsPage_());
  }
}

/**
 * 「账单统计」Modal 内的分类消费总览：依分类分组（同分类若用了多种货币会各自一行），
 * 点击某个分类可以打开该分类的完整消费清单
 */
function renderCategorySummary() {
  const container = document.getElementById('categorySummaryList');
  if (!container) return;

  const data = appState.categorySummary || [];

  if (data.length === 0) {
    renderEmptyBlock('categorySummaryList', t('empty.noCategory.title'), t('empty.noCategory.desc'));
    return;
  }

  container.innerHTML = data.map((item) => {
    const iconMeta = getCategoryIconMeta(item.category);
    return `
      <div class="balance-row" data-category="${escapeHtml(item.category)}" role="button" tabindex="0" style="cursor:pointer;">
        <div class="activity-icon ${iconMeta.cls}" aria-hidden="true">${iconMeta.svg}</div>
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(translateCategory(item.category))}</p>
          <p class="balance-sub">${escapeHtml(t('categoryModal.subtitle', { count: item.count, total: formatMoney(item.total, item.currency) }))}</p>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-category]').forEach((row) => {
    row.addEventListener('click', () => openCategoryExpensesModal(row.getAttribute('data-category')));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCategoryExpensesModal(row.getAttribute('data-category'));
      }
    });
  });
}

/**
 * 打开某个分类的完整消费清单 Modal（从「账单统计」Modal 点某个分类进来）
 * @param {string} category 分类代号
 */
function openCategoryExpensesModal(category) {
  const expenses = (appState.expenses || []).filter((e) => e.Category === category);

  const titleEl = document.getElementById('categoryExpensesTitle');
  if (titleEl) titleEl.textContent = translateCategory(category);

  const subtitleEl = document.getElementById('categoryExpensesSubtitle');
  if (subtitleEl) {
    // 同一分类底下的消费不一定都是同一种货币（例如金库支出跟一般消费币种不同），
    // 不能把不同货币的原始金额直接加总——依币种分组后并列显示，跟「所有消费」
    // Modal（openAllExpensesModal）用同一套逻辑，两处呈现方式才会一致
    const totalBreakdown = groupAmountsByCurrency(expenses, (item) => item.Amount, (item) => item.Currency);
    subtitleEl.textContent = t('categoryModal.subtitle', { count: expenses.length, total: formatCurrencyBreakdownText(totalBreakdown) });
  }

  if (expenses.length === 0) {
    renderEmptyBlock('categoryExpensesList', t('categoryModal.empty.title'), t('categoryModal.empty.desc'));
  } else {
    const listEl = document.getElementById('categoryExpensesList');
    if (listEl) {
      listEl.innerHTML = expenses.map((expense) => `
        <div class="balance-row">
          <div class="avatar">${escapeHtml(getInitials(expense.Payer))}</div>
          <div class="balance-info">
            <p class="balance-name">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
            <p class="balance-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))}</p>
          </div>
          <p class="balance-amount mono">${formatExpenseAmountDisplay(expense)}</p>
        </div>
      `).join('');
    }
  }

  showSecondaryPage_('category-expenses');
}


/* ------------------------------------------------------------
   10B. 搭伙金库 (Divvy Pool)
   这是「公家的钱」：每次登记打款一律视为向「当下」全体成员均收，不追踪谁给了没给；
   一趟旅程可以用不同的人均金额、不同的货币登记好几次（旅行常常要换好几种货币）。
   appState.pool 的结构对应後端 handleGetPool()：
   {
     enabled, isTripSettled, settledAt,
     currencies: [{ currency, collected, spent, refunded, balance, isLowBalance }, ...],
     topups: [{ id, perPersonAmount, currency, memberCount, totalAmount, createdAt, note }, ...],
     topupCount, transactions: [...]
   }
   ------------------------------------------------------------ */

/* ===== 10B-1. 常数与状态机 ===== */

// 低余额预警阈值：剩余余额 / 已收总额 < 15% 时触发（依货币各自判断）
const POOL_LOW_BALANCE_RATIO = 0.15;
// 资金充足门槛：>= 50% 视为「资金充足」
const POOL_SUFFICIENT_RATIO = 0.5;

const POOL_STATUS = {
  COLLECTING: 'collecting',
  SUFFICIENT: 'sufficient',
  LOW: 'low',
  SETTLED: 'settled'
};

/**
 * 依 appState.pool 目前状态判断该显示哪一种吉祥物/卡片状态
 * 有多种货币时，用「最紧张」的那个货币（比例最低者）决定整体状态——任何一种货币
 * 余额告急，都值得让使用者注意到，不会被其他货币还很充裕的假象盖过去
 * @param {Object} pool appState.pool
 * @return {string} POOL_STATUS 之一
 */
function getPoolStatus(pool) {
  if (!pool || !pool.enabled) {
    return POOL_STATUS.COLLECTING;
  }
  if (pool.isTripSettled) {
    return POOL_STATUS.SETTLED;
  }

  // 用「这一轮」（roundCollected，後端 handleGetPool 算好的，上次结程退余之後
  // 重新累计）当分母，不能用 c.collected（金库开通以来的历史总额）——不然
  // 结程退余重新开一轮之後，比例会被旧一轮的历史总额稀释，明明这一轮才刚
  // 充满却被判定成快见底，徽章显示「余额告警」
  const ratios = (pool.currencies || [])
    .map((c) => ({ balance: c.balance, total: c.roundCollected > 0 ? c.roundCollected : c.collected }))
    .filter((item) => item.total > 0)
    .map((item) => item.balance / item.total);

  if (ratios.length === 0) {
    return POOL_STATUS.COLLECTING;
  }

  const worstRatio = Math.min(...ratios);
  if (worstRatio < POOL_LOW_BALANCE_RATIO - AMOUNT_TOLERANCE) {
    return POOL_STATUS.LOW;
  }
  if (worstRatio >= POOL_SUFFICIENT_RATIO - AMOUNT_TOLERANCE) {
    return POOL_STATUS.SUFFICIENT;
  }
  return POOL_STATUS.COLLECTING;
}

/* ===== 10B-2. 智能预警 (Alert) ===== */

// 避免同一趟旅程重复弹出低余额 Toast，只在「刚跌破阈值」的那一刻提醒一次
let poolLowBalanceAlerted = false;

/**
 * 每次金库状态更新後呼叫：任一货币的余额比例 < 15% 就触发一次性告警 Toast
 * 余额回升到阈值以上会重置旗标，下次再度跌破时可以再提醒一次
 */
function checkPoolLowBalanceAlert() {
  const pool = appState.pool;
  if (!pool || !pool.enabled) return;

  const lowCurrencies = (pool.currencies || []).filter((c) => c.isLowBalance);
  const isLow = lowCurrencies.length > 0;

  if (isLow && !poolLowBalanceAlerted) {
    poolLowBalanceAlerted = true;
    showToast('warning', t('pool.alert.lowBalanceTitle'), t('pool.alert.lowBalanceMessage', {
      currency: lowCurrencies.map((c) => c.currency).join('、')
    }));
  } else if (!isLow) {
    poolLowBalanceAlerted = false;
  }

  renderDivvyPoolCard();
}

/* ===== 10B-3. 吉祥物微交互 (Mascot Micro-interaction) ===== */

/**
 * 品牌吉祥物图示（DivvyDuck logo：除号造型的鸭子），金库卡片与 Hero Card 的
 * 「点一下换一句文案」互动共用同一个图示，不再依状态切换成不同的线稿鸭子——
 * 状态本身已经有徽章／主题色可以辨识，图示统一用品牌标誌，识别度更高
 */
const DIVVY_DUCK_LOGO_SVG = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ddLogoBeak" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FBBF24"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </linearGradient>
        <linearGradient id="ddLogoBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#818CF8"/>
        </linearGradient>
      </defs>
      <g transform="rotate(-12, 50, 50)">
        <circle cx="50" cy="27" r="13" fill="#0F172A"/>
        <circle cx="54" cy="24" r="2.8" fill="#FFFFFF"/>
        <path d="M 61 25 C 71 25, 75 29, 72 34 C 69 37, 61 34, 61 30 Z" fill="url(#ddLogoBeak)"/>
        <rect x="22" y="46" width="56" height="10" rx="5" fill="url(#ddLogoBar)"/>
        <path d="M 28 67 C 28 67, 38 65, 50 65 C 62 65, 72 67, 72 67 C 72 78, 62 84, 50 84 C 38 84, 28 78, 28 67 Z" fill="#0F172A"/>
      </g>
    </svg>`;

const POOL_MASCOT_COPY_KEYS = {
  collecting: ['pool.mascot.collecting.1', 'pool.mascot.collecting.2'],
  sufficient: ['pool.mascot.sufficient.1', 'pool.mascot.sufficient.2'],
  low: ['pool.mascot.low.1', 'pool.mascot.low.2'],
  settled: ['pool.mascot.settled.1', 'pool.mascot.settled.2']
};

const poolMascotCopyIndexCache = {};

function getPoolMascotSvg() {
  return DIVVY_DUCK_LOGO_SVG;
}

function getPoolMascotCopy(status, forceNext) {
  const keys = POOL_MASCOT_COPY_KEYS[status] || POOL_MASCOT_COPY_KEYS.collecting;

  if (forceNext || poolMascotCopyIndexCache[status] === undefined) {
    const prevIndex = poolMascotCopyIndexCache[status] || 0;
    poolMascotCopyIndexCache[status] = (prevIndex + 1) % keys.length;
  }

  return t(keys[poolMascotCopyIndexCache[status]]);
}

/**
 * 点击吉祥物的微交互：换一句文案 + 轻微弹跳动画
 * @param {HTMLElement} mascotEl
 */
function onPoolMascotTap(mascotEl) {
  if (!mascotEl) return;
  const status = getPoolStatus(appState.pool);

  const copyEl = mascotEl.parentElement && mascotEl.parentElement.querySelector('.pool-mascot-copy');
  if (copyEl) {
    copyEl.textContent = getPoolMascotCopy(status, true);
  }

  mascotEl.classList.remove('pool-mascot-bounce');
  void mascotEl.offsetWidth;
  mascotEl.classList.add('pool-mascot-bounce');
}

/**
 * Hero Card 版的吉祥物文案——依「该收/该付/已结清」三种个人净额状态，各自准备两句，
 * 跟金库卡片的 pool.mascot.* 系统同一套写法（getPoolMascotCopy 的 Hero Card 版本）
 */
const HERO_MASCOT_COPY_KEYS = {
  receivable: ['hero.mascot.receivable.1', 'hero.mascot.receivable.2'],
  payable: ['hero.mascot.payable.1', 'hero.mascot.payable.2'],
  settled: ['hero.mascot.settled.1', 'hero.mascot.settled.2']
};

const heroMascotCopyIndexCache = {};

function getHeroMascotCopy(status, forceNext) {
  const keys = HERO_MASCOT_COPY_KEYS[status] || HERO_MASCOT_COPY_KEYS.settled;

  if (forceNext || heroMascotCopyIndexCache[status] === undefined) {
    const prevIndex = heroMascotCopyIndexCache[status] || 0;
    heroMascotCopyIndexCache[status] = (prevIndex + 1) % keys.length;
  }

  return t(keys[heroMascotCopyIndexCache[status]]);
}

/**
 * 点击 Hero Card 吉祥物的微交互：换一句文案 + 轻微弹跳动画，跟金库卡片的
 * onPoolMascotTap 是同一套互动手感，只是状态判断依据换成「登入账号自己的净额」
 * @param {HTMLElement} mascotEl
 */
function onHeroMascotTap(mascotEl) {
  if (!mascotEl) return;

  const viewerName = getViewerName();
  const balances = (appState.summary && appState.summary.balances) || [];
  const item = viewerName ? balances.find((b) => b.name === viewerName) : null;
  if (!item) return;

  const status = item.balance > AMOUNT_TOLERANCE ? 'receivable' : (item.balance < -AMOUNT_TOLERANCE ? 'payable' : 'settled');

  const copyEl = mascotEl.parentElement && mascotEl.parentElement.querySelector('.hero-mascot-copy');
  if (copyEl) {
    copyEl.textContent = getHeroMascotCopy(status, true);
  }

  mascotEl.classList.remove('pool-mascot-bounce');
  void mascotEl.offsetWidth;
  mascotEl.classList.add('pool-mascot-bounce');
}

/* ===== 10B-4. Cool Slate 卡片组件 (UI Card) ===== */

const POOL_STATUS_THEME_CLASS = {
  collecting: 'pool-theme-collecting',
  sufficient: 'pool-theme-sufficient',
  low: 'pool-theme-low',
  settled: 'pool-theme-settled'
};

/**
 * 主渲染入口：把 appState.pool 目前状态画到 #divvyPoolCard
 */
function renderDivvyPoolCard() {
  const container = document.getElementById('divvyPoolCard');
  if (!container) return;

  const pool = appState.pool;

  // 金库还没开始用（一次都没登记过打款），或是已经结清/全数退还（isTripSettled，
  // 每种货币余额都归零）时，都不显示卡片——不残留「MYR 0.00 / 共 MYR 1000」这种
  // 已经结清的旧卡片。金库本身还是能继续用，只要在设置页面重新充值，isTripSettled
  // 会自动变回 false，卡片就会重新出现（不需要另外的「重新开启」步骤）
  if (!pool || !pool.enabled || pool.isTripSettled) {
    container.innerHTML = '';
    container.classList.add('is-hidden');
    renderPoolSettingsPanel();
    updateDashCardSliderState();
    return;
  }
  container.classList.remove('is-hidden');

  const status = getPoolStatus(pool);
  const themeClass = POOL_STATUS_THEME_CLASS[status] || POOL_STATUS_THEME_CLASS.collecting;
  // 结程退余按钮只在「目前有余额可以退，而且这个账号有管理权限（启动人或旅程建立者）」
  // 才出现——没有管理权限的参与者，卡片只能查看明细，不该看到一个点了会被後端拒绝的按钮
  const hasBalanceToSettle = pool.currencies.some((c) => c.balance > AMOUNT_TOLERANCE) && !!pool.canManagePool;

  container.className = `divvy-pool-card ${themeClass}`;
  container.innerHTML = `
    <div class="pool-card-glow" aria-hidden="true"></div>

    <div class="pool-card-top">
      <div class="pool-mascot-wrap">
        <button type="button" class="pool-mascot" onclick="onPoolMascotTap(this)" aria-label="${escapeHtml(t('pool.mascot.ariaLabel'))}">
          ${getPoolMascotSvg()}
        </button>
        <p class="pool-mascot-copy">${escapeHtml(getPoolMascotCopy(status))}</p>
      </div>

      <div class="pool-status-badge">
        <span class="pool-status-dot"></span>
        ${escapeHtml(t(`pool.status.${status}`))}
      </div>
    </div>

    <div class="pool-card-body">
      <p class="pool-currency-list-label">${escapeHtml(t('pool.card.balanceLabel'))}</p>
      <div class="pool-currency-list">
        ${pool.currencies.map((c) => {
          // 「共 X」跟进度条统一用「这一轮」（上次结程退余之後）累计收了多少
          // （後端 roundCollected，见 Code.gs handleGetPool）——不能用金库开通
          // 以来的历史总额 c.collected，不然结程退余重新开一轮小额充值时，
          // 比例会被旧一轮的历史总额稀释，明明这一轮才刚充满却显示快见底。
          // 也不是只抓「最近一笔」充值：同一轮如果分好几笔登记，要整轮加总，
          // 不能漏掉前面几笔
          const roundTotal = c.roundCollected > 0 ? c.roundCollected : c.collected;
          const ratio = roundTotal > 0 ? Math.max(0, Math.min(1, c.balance / roundTotal)) : 0;
          return `
          <div class="pool-currency-row${c.isLowBalance ? ' is-low' : ''}">
            <div class="pool-currency-row-top">
              <span class="pool-currency-code">${escapeHtml(c.currency)}</span>
              <span class="pool-currency-balance mono">${escapeHtml(formatMoney(c.balance, c.currency))}</span>
            </div>
            <div class="pool-progress-track">
              <div class="pool-progress-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>
            </div>
            <p class="pool-currency-sub">${escapeHtml(t('pool.card.ofTotal', { total: formatMoney(roundTotal, c.currency) }))}</p>
          </div>`;
        }).join('')}
      </div>
      <p class="pool-topup-count">${escapeHtml(t('pool.card.topupCountSummary', { count: pool.topupCount }))}</p>
    </div>

    <div class="pool-card-actions">
      <button type="button" class="btn btn-secondary btn-sm pool-btn-detail" onclick="openPoolDetailModal()">
        ${escapeHtml(t('pool.card.detailBtn'))}
      </button>
      ${hasBalanceToSettle ? `
        <button type="button" class="btn btn-primary btn-sm pool-btn-settle" onclick="handlePoolSettle()">
          <span class="btn-label">${escapeHtml(t('pool.card.settleBtn'))}</span>
          <span class="btn-spinner" aria-hidden="true"></span>
        </button>` : ''}
    </div>
  `;

  renderPoolSettingsPanel();
  updateDashCardSliderState();
}

/**
 * 结程一键退余：先跳确认（不可逆动作），确认後才呼叫後端 poolSettle 结算——
 * 这是公家的钱，退余一律按目前成员人数平分，每种还有余额的货币各自算一次
 */
function handlePoolSettle() {
  const pool = appState.pool;
  if (!pool) return;

  openConfirmModal(t('pool.settle.confirmMessage'), async () => {
    const { data, error: settleError } = await supabaseClient.rpc('pool_settle', { _trip_id: currentTripId });
    if (settleError) throw settleError;

    const refunds = (data || []).map((row) => ({
      currency: row.currency,
      perPersonAmount: Number(row.per_person_amount) || 0,
      totalAmount: Number(row.total_amount) || 0,
      memberCount: row.member_count
    }));

    appState.pool = await fetchPoolStatus_();
    closeActiveModal();

    // 金库退款不会写入 repayments 表、也不是 expenses（不影响应收/应付、也不会
    // 出现在账目页），但 Hero Card 的「已收金额」小格子、金库设定页要跟着更新
    renderEverything();

    const posterData = buildPoolRefundPoster_(refunds, appState.members);
    if (posterData && typeof openPoolRefundPoster === 'function') {
      openPoolRefundPoster(posterData);
    }
  }, {
    title: t('pool.settle.confirmTitle'),
    confirmLabel: t('pool.settle.confirmLabel'),
    danger: false // 结程不是删除/危险操作，改用一般强调色按钮，不要吓到人
  });
}

/**
 * 组出「结账海报」需要的资料结构：每个人在每种货币各退多少（公家的钱一律均分，
 * 所以同一货币下每个人的退款金额都一样）。同时依货币是否为旅程基准货币，标注
 * 这笔钱该怎麼处理——基准货币可以直接跟旅程内部的欠款互相抵扣，不用真的转账；
 * 外币则是实体现金，只能真的退还，两者在报告与画面上都要清楚区分
 * @param {Array<{currency, perPersonAmount, totalAmount, memberCount}>} refunds 後端算好的每货币退款
 * @param {Array<string>} members 目前的完整成员名单
 * @return {Object|null}
 */
function buildPoolRefundPoster_(refunds, members) {
  const baseCurrency = (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR';

  if (!refunds || refunds.length === 0) {
    return { poolTitle: t('pool.poster.title'), lines: [], currencySummary: [] };
  }

  const lines = [];
  (members || []).forEach((name) => {
    refunds.forEach((r) => {
      const isBaseCurrency = r.currency === baseCurrency;
      lines.push({
        name,
        currency: r.currency,
        refundAmount: r.perPersonAmount,
        isBaseCurrency,
        treatmentLabel: isBaseCurrency ? t('pool.poster.offsetLabel') : t('pool.poster.cashRefundLabel'),
        summaryLine: t('pool.poster.refundLine', {
          name,
          refund: formatMoney(r.perPersonAmount, r.currency)
        })
      });
    });
  });

  return {
    poolTitle: t('pool.poster.title'),
    lines,
    currencySummary: refunds.map((r) => ({
      currency: r.currency,
      totalAmount: r.totalAmount,
      perPersonAmount: r.perPersonAmount,
      memberCount: r.memberCount,
      isBaseCurrency: r.currency === baseCurrency
    }))
  };
}

/**
 * 结程後跳出「每人该退多少」的明细 Modal——按人分组显示，每种货币各自一行，
 * 并标注这笔钱是「可跟旅程内部欠款互相抵扣」（基准货币）还是「需要退还现金」（外币）。
 * 没有任何退款（余额本来就是 0）时显示空状态，而不是完全没反应
 * @param {{poolTitle: string, lines: Array, currencySummary: Array}|null} posterData
 */
function openPoolRefundPoster(posterData) {
  const listEl = document.getElementById('poolRefundList');
  if (!listEl) return;

  const titleEl = document.getElementById('poolRefundTitle');
  if (titleEl && posterData && posterData.poolTitle) {
    titleEl.textContent = posterData.poolTitle;
  }

  if (!posterData || !posterData.lines || posterData.lines.length === 0) {
    renderEmptyBlock('poolRefundList', t('pool.poster.noRefundTitle'), t('pool.poster.noRefundDesc'));
    openModal('poolRefundModal');
    return;
  }

  // 依人分组：同一个人如果登记过多种货币，各货币的退款都会列在同一个人名底下
  const grouped = {};
  posterData.lines.forEach((line) => {
    if (!grouped[line.name]) grouped[line.name] = [];
    grouped[line.name].push(line);
  });

  listEl.innerHTML = Object.keys(grouped).map((name) => `
    <div class="pool-refund-member-group">
      <p class="pool-refund-member-name">${escapeHtml(name)}</p>
      ${grouped[name].map((line) => `
        <div class="pool-refund-row">
          <span class="pool-refund-amount mono">${escapeHtml(formatMoney(line.refundAmount, line.currency))}</span>
          <span class="pool-refund-tag ${line.isBaseCurrency ? 'is-offset' : 'is-cash'}">${escapeHtml(line.treatmentLabel)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  openModal('poolRefundModal');
}

/**
 * 打开「搭伙金库明细」Modal：只显示各货币余额概况 + 充值（登记打款）流水——
 * 金库支出／结程退余那些流水已经分别看得到在「账目」页与结程时跳出的退款
 * 明细弹窗，这里只留使用者最常想确认的「我到底充值了几次、每次多少」
 */
function openPoolDetailModal() {
  const pool = appState.pool;
  const bodyEl = document.getElementById('poolDetailBody');
  if (!bodyEl) return;

  if (!pool || !pool.enabled) {
    renderEmptyBlock('poolDetailBody', t('pool.detail.emptyTitle'), t('pool.detail.emptyDesc'));
    showSecondaryPage_('pool-detail');
    return;
  }

  const subtitleEl = document.getElementById('poolDetailSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = t('pool.settings.topupCountSummary', { count: pool.topupCount });
  }

  const currencySummaryHtml = `
    <div class="pool-settings-currency-list">
      ${pool.currencies.map((c) => `
        <div class="pool-settings-currency-row">
          <span>${escapeHtml(c.currency)}</span>
          <span class="mono">${escapeHtml(formatMoney(c.balance, c.currency))} / ${escapeHtml(formatMoney(c.collected, c.currency))}</span>
        </div>`).join('')}
    </div>
  `;

  const topupHtml = pool.topups.length > 0 ? `
    <div class="pool-detail-section">
      <p class="pool-detail-section-title">${escapeHtml(t('pool.report.topupTitle'))}</p>
      ${pool.topups.map((item) => `
        <div class="pool-detail-row">
          <div class="pool-detail-row-info">
            <p class="pool-detail-row-title">${escapeHtml(formatMoney(item.perPersonAmount, item.currency))} × ${item.memberCount}</p>
            <p class="pool-detail-row-sub">${escapeHtml(formatDateDisplay(item.createdAt))}</p>
          </div>
          <p class="pool-detail-row-amount mono">${escapeHtml(formatMoney(item.totalAmount, item.currency))}</p>
        </div>`).join('')}
    </div>
  ` : `<div class="pool-detail-section"><p class="pool-detail-section-title">${escapeHtml(t('pool.report.topupTitle'))}</p><p class="report-summary-row">${escapeHtml(t('pool.report.noTopups'))}</p></div>`;

  bodyEl.innerHTML = currencySummaryHtml + topupHtml;
  showSecondaryPage_('pool-detail');
}

/* ===== 10B-5. 设置页面板：登记打款 ===== */

// 「启动金库」按钮按下後，本地暂时记住要展开充值表单——纯粹是这次画面停留期间的
// UI 状态，不是真的後端状态；一旦真的送出第一笔充值，pool.enabled 就会变 true，
// 之後就不会再用到这个旗标了（重新整理页面会恢复原状，属於预期内的行为）
let poolEnableFormRevealed_ = false;

/**
 * 「启动金库」按钮点击：本地展开充值表单——backend 是用「第一笔充值」兼任「开启」
 * （见 Code.gs handleTopupPool 的说明），所以这里不用另外呼叫 API，纯粹展开表单，
 * 让使用者接着填人均金额、送出後端才会真的把金库「开」起来
 */
function handlePoolEnableButtonClick() {
  poolEnableFormRevealed_ = true;
  renderPoolSettingsPanel();
}

/**
 * 把金库目前各货币的「余额 / 这一轮累计收款」组成一行摘要文字，例如「MYR 0.00 / MYR 800.00」，
 * 多货币用顿号分隔——「余额」是现在还剩多少能花，「累计收款」是这一轮（上次结程退余之後）
 * 总共收了多少，两个数字放在一起才看得出「花了多少」，只看余额容易誤以为钱变少了、
 * 其实是花掉了。这裡故意不用 c.collected（金库开通以来的历史总额）——结程退余、
 * 重新开一轮之後，旧一轮已经退掉的结余不该算进「现在这一轮收了多少」，
 * 不然明明这一轮才刚收满，摘要却显示一个混进上一轮结余的虚高数字，
 * 跟 renderDivvyPoolCard()／renderPoolSettingsPanel() 的进度条算法保持一致
 * @param {Object} pool appState.pool，必须是 pool.enabled 为 true 的情况才呼叫
 * @return {string}
 */
function formatPoolBalanceSummary_(pool) {
  return (pool.currencies || [])
    .map((c) => {
      const roundCollected = c.roundCollected > 0 ? c.roundCollected : c.collected;
      return `${formatMoney(c.balance, c.currency)} / ${formatMoney(roundCollected, c.currency)}`;
    })
    .join('、');
}

/**
 * 设置页「搭伙鸭金库」面板的摘要：不管目前是「还没开启」「已开启但唯读」
 * 「已开启且能管理」哪一种状态，都只显示一行标题＋一行说明，不用点进
 * page-pool-manage 二级页面就能看个大概；按钮文字也跟着状态换（还没开启
 * 显示「开启」、已开启但不能管理显示「查看」、能管理才显示「更改」），
 * 不是每种状态都适合叫「更改」——还没开启的东西没有「改」的对象。已开启
 * 的两种状态（唯读／可管理）说明文字都是「现在还有多少余额」，不是登记
 * 笔数——使用者点进设置页第一眼想知道的是「钱还够不够」，不是「记了几笔」
 * @param {Object|null} pool appState.pool
 * @param {boolean} canManage 目前这个账号是否有权限管理这个金库
 */
function renderPoolSettingsSummary_(pool, canManage) {
  const titleEl = document.getElementById('poolSettingsSummaryTitle');
  const descEl = document.getElementById('poolSettingsSummaryDesc');
  const btnEl = document.getElementById('openPoolManageBtn');
  if (!titleEl || !descEl || !btnEl) return;

  if (!pool || !pool.enabled) {
    titleEl.textContent = t('pool.form.enableLabel');
    descEl.textContent = t('pool.form.enableHint');
    btnEl.textContent = t('pool.form.enableBtnShort');
    return;
  }

  const balanceSummary = formatPoolBalanceSummary_(pool);

  if (!canManage) {
    titleEl.textContent = t('pool.settings.readOnlyTitle');
    descEl.textContent = balanceSummary;
    btnEl.textContent = t('common.view');
    return;
  }

  titleEl.textContent = t('pool.settings.statusTitle');
  descEl.textContent = balanceSummary;
  btnEl.textContent = t('account.changeBtn');
}

/**
 * 设置页「搭伙鸭金库」面板，依权限与开启状态分三种呈现：
 *   1. 还没开始用：只显示「启动金库」按钮，任何成员都看得到、点得下去——
 *      谁先按、谁填了第一笔充值，谁就顺便成为这个金库的「启动人」（後端权限判断的依据）
 *   2. 已经开始用，但这个账号不是启动人也不是旅程建立者：显示「金库已开启」+
 *      目前各货币余额的唯读摘要，不给充值表单／编辑按钮——充值与结程退余
 *      只有启动人或旅程建立者能做
 *   3. 已经开始用，而且这个账号有管理权限：摘要 + 充值表单 + 所有充值记录
 *      （记录直接列在充值表单下面，点其中一笔就地展开编辑，不用再另外点一次
 *      「更改」跳进别的画面——记录直接就地展开，不用再点第二次）
 * 权限判断完全信任後端回传的 pool.canManagePool，不在前端自己重算一次
 * （後端才有真正的资料去源，前端重算容易漏掉边界情况、也可能跟後端实际允许的动作对不上）
 * 容错：容器不存在（旧版 index.html 还没加这段）时安全跳过
 */

function renderPoolSettingsPanel() {
  const container = document.getElementById('poolSettingsPanel');
  if (!container) return;

  const pool = appState.pool;
  const canManage = !!(pool && pool.canManagePool);

  renderPoolSettingsSummary_(pool, canManage);

  // ---- 状态一：金库还没开始用，而且使用者还没按下「启动金库」----
  if ((!pool || !pool.enabled) && !poolEnableFormRevealed_) {
    container.innerHTML = `
      <div class="settings-row">
        <div class="settings-row-text">
          <p class="settings-row-title">${escapeHtml(t('pool.form.enableLabel'))}</p>
          <p class="settings-row-desc">${escapeHtml(t('pool.form.enableHint'))}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="handlePoolEnableButtonClick()">
          ${escapeHtml(t('pool.form.enableLabel'))}
        </button>
      </div>
    `;
    return;
  }

  // ---- 状态二：金库已开启，但这个账号没有管理权限——唯读，不给表单 ----
  if (pool && pool.enabled && !canManage) {
    container.innerHTML = `
      <div class="settings-row">
        <div class="settings-row-text">
          <p class="settings-row-title">${escapeHtml(t('pool.settings.readOnlyTitle'))}</p>
          <p class="settings-row-desc">${escapeHtml(t('pool.settings.readOnlyDesc'))}</p>
        </div>
      </div>
      <div class="pool-settings-currency-list">
        ${pool.currencies.map((c) => `
          <div class="pool-settings-currency-row">
            <span>${escapeHtml(c.currency)}</span>
            <span class="mono">${escapeHtml(formatMoney(c.balance, c.currency))} / ${escapeHtml(formatMoney(c.collected, c.currency))}</span>
          </div>`).join('')}
      </div>
    `;
    return;
  }

  // ---- 状态三：有管理权限（启动人或旅程建立者），或者还没开始用、刚按下「启动金库」----
  // 充值表单一律显示，不因为「目前刚好结清」就锁住——结程只是把当下的余额退掉，
  // 金库本身还是可以继续用，欢迎再充值开始新的一轮
  const memberCount = (appState.members || []).length;

  container.innerHTML = `
    <div class="settings-row">
      <div class="settings-row-text">
        <p class="settings-row-title" data-i18n="pool.settings.topupFormTitle">${escapeHtml(t('pool.settings.topupFormTitle'))}</p>
        <p class="settings-row-desc">${escapeHtml(t('pool.settings.topupFormDesc', { count: memberCount }))}</p>
      </div>
    </div>
    <div class="pool-settings-enable-row">
      <input type="number" class="text-input" id="poolTopupPerPersonInput" min="0" step="0.01" placeholder="${escapeHtml(t('pool.form.perPersonLabel'))}" oninput="updatePoolTopupPreview()">
      <select class="suffix-select" id="poolTopupCurrencySelect" aria-label="${escapeHtml(t('table.currency'))}" onchange="updatePoolTopupPreview()"></select>
      <button type="button" class="btn btn-primary btn-sm" id="poolTopupSubmitBtn" onclick="handlePoolTopupSubmit()">
        <span class="btn-label">${escapeHtml(t('pool.settings.topupBtn'))}</span>
        <span class="btn-spinner" aria-hidden="true"></span>
      </button>
    </div>
    <p class="form-hint" id="poolTopupPreview"></p>

    <p class="settings-row-title pool-topup-records-title" data-i18n="pool.settings.recordsTitle">${escapeHtml(t('pool.settings.recordsTitle'))}</p>
    <div id="poolTopupRecordsBody"></div>
  `;

  renderCurrencySelectOptions('poolTopupCurrencySelect', appState.tripCurrency.baseCurrency);
  updatePoolTopupPreview();
  renderPoolTopupEditList();
}

/**
 * 登记打款表单的即时预览：人均金额 × 目前成员人数 = 这次要登记的总额，
 * 每次改人均金额都重新算一次，让使用者送出前先看得到算出来的总额对不对
 */
function updatePoolTopupPreview() {
  const input = document.getElementById('poolTopupPerPersonInput');
  const currencySelect = document.getElementById('poolTopupCurrencySelect');
  const previewEl = document.getElementById('poolTopupPreview');
  if (!input || !previewEl) return;

  const perPerson = Number(input.value) || 0;
  const memberCount = (appState.members || []).length;
  const currency = currencySelect ? currencySelect.value : '';

  if (!(perPerson > 0) || memberCount === 0) {
    previewEl.textContent = '';
    return;
  }

  const total = roundAmount_(perPerson * memberCount);
  previewEl.textContent = t('pool.settings.topupPreview', {
    count: memberCount,
    perPerson: formatMoney(perPerson, currency),
    total: formatMoney(total, currency)
  });
}

/**
 * 登记打款送出：人均金额 × 目前成员人数（由後端统一计算，不信任前端算好的总额），
 * 呼叫後端 poolTopup——不管这趟旅程之前有没有登记过，都是同一支
 */
async function handlePoolTopupSubmit() {
  const input = document.getElementById('poolTopupPerPersonInput');
  const currencySelect = document.getElementById('poolTopupCurrencySelect');
  const perPersonAmount = input ? Number(input.value) : 0;
  const currency = currencySelect ? currencySelect.value : '';

  if (!(perPersonAmount > 0)) {
    showToast('error', t('pool.error.invalidAmount'), '');
    return;
  }
  if (!appState.members || appState.members.length === 0) {
    showToast('error', t('pool.settings.noMembers'), '');
    return;
  }

  const btn = document.getElementById('poolTopupSubmitBtn');
  setButtonLoading(btn, true);

  try {
    const { error: topupError } = await supabaseClient.rpc('pool_topup', {
      _trip_id: currentTripId,
      _per_person_amount: perPersonAmount,
      _currency: currency
    });
    if (topupError) throw topupError;
    appState.pool = await fetchPoolStatus_();

    setButtonLoading(btn, false);
    // 表单会自然清空、金库卡片/余额、Hero Card 的「已付金额」小格子同步更新
    renderEverything();
  } catch (error) {
    showToast('error', t('pool.topup.failedTitle'), error.message);
    setButtonLoading(btn, false);
  }
}

/**
 * Modal 的「列表」画面：列出这趟旅程所有登记打款纪录，点其中一笔进「编辑」画面
 */
function renderPoolTopupEditList() {
  const pool = appState.pool;
  const bodyEl = document.getElementById('poolTopupRecordsBody');
  if (!pool || !bodyEl) return;

  const topups = pool.topups || [];

  if (topups.length === 0) {
    renderEmptyBlock('poolTopupRecordsBody', t('pool.settings.editTopupEmptyTitle'), t('pool.settings.editTopupEmptyDesc'));
    return;
  }

  bodyEl.innerHTML = topups.map((item) => `
    <div class="pool-detail-row" data-topup-id="${escapeHtml(item.id)}" role="button" tabindex="0" style="cursor: pointer;">
      <div class="pool-detail-row-info">
        <p class="pool-detail-row-title">${escapeHtml(formatMoney(item.perPersonAmount, item.currency))} × ${item.memberCount}</p>
        <p class="pool-detail-row-sub">${escapeHtml(formatDateDisplay(item.createdAt))}</p>
      </div>
      <p class="pool-detail-row-amount mono">${escapeHtml(formatMoney(item.totalAmount, item.currency))}</p>
    </div>
  `).join('');

  bodyEl.querySelectorAll('[data-topup-id]').forEach((row) => {
    const goEdit = () => renderPoolTopupEditForm(row.getAttribute('data-topup-id'));
    row.addEventListener('click', goEdit);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goEdit();
      }
    });
  });
}

/**
 * Modal 的「编辑」画面：改这一笔的人均金额／货币，总额由後端用当初登记的人数重算
 * @param {string} topupId 要编辑的登记打款 ID
 */
function renderPoolTopupEditForm(topupId) {
  const pool = appState.pool;
  const bodyEl = document.getElementById('poolTopupRecordsBody');
  const item = (pool && pool.topups || []).find((topup) => topup.id === topupId);
  if (!item || !bodyEl) return;

  bodyEl.innerHTML = `
    <button type="button" class="link-btn" onclick="renderPoolTopupEditList()">${escapeHtml(t('common.back'))}</button>
    <div class="form-field" style="margin-top: var(--space-3, 12px);">
      <label for="poolTopupEditAmount">${escapeHtml(t('pool.form.perPersonLabel'))}</label>
      <div class="input-with-suffix">
        <input type="number" class="text-input" id="poolTopupEditAmount" min="0" step="0.01" value="${item.perPersonAmount}">
        <select class="suffix-select" id="poolTopupEditCurrency" aria-label="${escapeHtml(t('table.currency'))}"></select>
      </div>
      <p class="form-hint">${escapeHtml(t('pool.settings.editTopupMemberCountNote', { count: item.memberCount }))}</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="poolTopupEditSubmitBtn" style="margin-top: var(--space-3, 12px); width: 100%;" onclick="handlePoolTopupEditSubmit('${escapeHtml(topupId).replace(/'/g, "\\'")}')">
      <span class="btn-label">${escapeHtml(t('common.save'))}</span>
      <span class="btn-spinner" aria-hidden="true"></span>
    </button>
  `;

  renderCurrencySelectOptions('poolTopupEditCurrency', item.currency);
}

/**
 * 送出「更改登记打款」：呼叫後端 poolUpdateTopup，成功後重绘整个金库设置面板——
 * 会连带回到充值记录清单画面（不是继续停在编辑表单），使用者能立刻看到改好的结果
 * @param {string} topupId 要编辑的登记打款 ID
 */
async function handlePoolTopupEditSubmit(topupId) {
  const amountInput = document.getElementById('poolTopupEditAmount');
  const currencySelect = document.getElementById('poolTopupEditCurrency');
  const perPersonAmount = amountInput ? Number(amountInput.value) : 0;
  const currency = currencySelect ? currencySelect.value : '';

  if (!(perPersonAmount > 0)) {
    showToast('error', t('pool.error.invalidAmount'), '');
    return;
  }

  const btn = document.getElementById('poolTopupEditSubmitBtn');
  setButtonLoading(btn, true);

  try {
    const { error: updateError } = await supabaseClient.rpc('pool_update_topup', {
      _trip_id: currentTripId,
      _topup_id: topupId,
      _per_person_amount: perPersonAmount,
      _currency: currency
    });
    if (updateError) throw updateError;
    appState.pool = await fetchPoolStatus_();

    renderEverything(); // Hero Card 的「已付金额」也可能因为改了金额/币种而跟着变
  } catch (error) {
    showToast('error', t('pool.settings.editTopupFailed'), error.message);
    setButtonLoading(btn, false);
  }
}

/* ===== 10B-6. Dashboard 顶部滑动卡片组（搭伙金库 + Hero Card） ===== */

let dashCardSliderHadPoolLast_ = false;

/**
 * 依 appState.pool 目前是否「开启」决定滑动卡片组要不要显示金库那张 slide 与分页点
 */
/**
 * 让 Hero 卡片的高度即时锁定并跟随金库卡片——CSS 的 align-items:stretch 在多数情况下
 * 已经能让两张卡片等高，但这里改用 JS 直接量测＋赋值当作保险：部分行动装置浏览器在
 * 「横向 overflow-x 卷动 + flex 撑高」这个组合下量测不够即时/準确，尤其是金库出现
 * 多种货币、内容变高（撑高卡片）的当下，两张卡片高度容易一时对不齐。
 * 每次金库卡片或 Hero 卡片重新渲染後都要呼叫一次，让两张卡片的高度保持同步
 */
function syncDashCardHeights() {
  const poolEl = document.getElementById('divvyPoolCard');
  const heroEl = document.getElementById('heroCard');
  const slider = document.getElementById('dashCardSlider');
  if (!poolEl || !heroEl || !slider) return;

  // 没开金库（金库卡片被拿掉/隐藏）时，Hero Card 恢复自己原本的高度，不需要跟随任何人
  if (!slider.classList.contains('has-pool') || poolEl.classList.contains('is-hidden')) {
    heroEl.style.minHeight = '';
    poolEl.style.minHeight = '';
    return;
  }

  // 实际去量測、赋值的动作抽成一个小函式，等一下要连续呼叫两次（见下方说明）
  const measureAndApply = () => {
    heroEl.style.minHeight = '';
    poolEl.style.minHeight = '';
    const targetHeight = Math.max(poolEl.offsetHeight, heroEl.offsetHeight);
    heroEl.style.minHeight = `${targetHeight}px`;
    poolEl.style.minHeight = `${targetHeight}px`;
  };

  // 用 requestAnimationFrame 确保这一輪 DOM 更新已经画完，量到的高度才是最新、準确的，
  // 量之前先清空舊的 min-height，避免舊值影响这次量到的「内容本来的高度」。
  // 手机版（尤其 iOS Safari）在「横向 overflow-x 卷动 + flex align-items:stretch」这个
  // 组合下，就算等到下一帧，有时候量到的还是切页/隐藏状态下的旧尺寸——单靠一次
  // rAF 不够保险，这里多加一次 100ms 後的延迟重量，抓住那个还没真正稳定下来的空档，
  // 桌面版这次多余的重量不会造成任何视觉差异（数值应该跟第一次算出来的一样）
  requestAnimationFrame(measureAndApply);
  setTimeout(measureAndApply, 100);
}

/**
 * 用 MutationObserver 盯着 #page-dashboard 的 class——不管是靠 navigateToPage()
 * 切页、还是开机流程本来就直接落在概览页（这种情况从来不会真的呼叫
 * navigateToPage('dashboard')，因为一开始就是显示状态，没有「切换」这个动作），
 * 只要 .is-hidden 被拿掉（这个页面变成看得到的那一刻），都会補一次高度同步。
 * 比在每个「可能让概览页变可见」的地方各自加一行呼叫更保险——不用穷举所有
 * 触发场景，只要结果是「这个页面现在看得到了」，都逃不掉这个观察者
 */
function initDashCardHeightObserver() {
  const dashPage = document.getElementById('page-dashboard');
  if (!dashPage || typeof MutationObserver === 'undefined') return;

  let wasHidden = dashPage.classList.contains('is-hidden');
  const observer = new MutationObserver(() => {
    const isHidden = dashPage.classList.contains('is-hidden');
    if (wasHidden && !isHidden) {
      syncDashCardHeights();
    }
    wasHidden = isHidden;
  });
  observer.observe(dashPage, { attributes: true, attributeFilter: ['class'] });
}

function updateDashCardSliderState() {
  const slider = document.getElementById('dashCardSlider');
  if (!slider) return;

  // 跟 renderDivvyPoolCard() 用同一个判断条件：金库还在使用（登记过打款）「而且」
  // 目前还没结清/全数退还（isTripSettled）才要显示这张 slide——结清後 renderDivvyPoolCard()
  // 只会把卡片内容清空、藏起 #divvyPoolCard，但这张 slide 的「格子」本身如果没有跟着
  // 收合，就会变成一片空白还占着位置、卡在滑动卡片组的第一格。这里让 slide 跟卡片
  // 的隐藏条件完全一致，结清时两者一起收合，重新充值後两者也会一起自动出现
  const hasPool = !!(appState.pool && appState.pool.enabled && !appState.pool.isTripSettled);
  slider.classList.toggle('has-pool', hasPool);

  if (hasPool && !dashCardSliderHadPoolLast_) {
    const track = document.getElementById('dashCardTrack');
    if (track) {
      track.scrollTo({ left: 0, behavior: 'auto' });
    }
  }
  dashCardSliderHadPoolLast_ = hasPool;

  updateDashCardDots_();
  syncDashCardHeights();
}

function updateDashCardDots_() {
  const track = document.getElementById('dashCardTrack');
  const dots = document.querySelectorAll('#dashCardDots .dash-card-dot');
  if (!track || dots.length === 0) return;

  const slideWidth = track.clientWidth || 1;
  const activeIndex = Math.round(track.scrollLeft / slideWidth);

  dots.forEach((dot, index) => {
    dot.classList.toggle('is-active', index === activeIndex);
  });
}

/**
 * 初始化滑动卡片组：分页点点击 → 滑到对应卡片；手动滑动 → 同步分页点亮起状态
 */
function initDashCardSlider() {
  const track = document.getElementById('dashCardTrack');
  const dots = document.getElementById('dashCardDots');
  if (!track || !dots) return;

  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('.dash-card-dot');
    if (!dot) return;
    const index = Number(dot.getAttribute('data-slide-index')) || 0;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  });

  const onScroll = debounce(() => updateDashCardDots_(), 80);
  track.addEventListener('scroll', onScroll);
  window.addEventListener('resize', debounce(() => {
    updateDashCardDots_();
    syncDashCardHeights();
  }, 150));
}

/* ===== 10B-7. 建立旅程表单里的金库开关 ===== */

/**
 * 建立账单表单里「开启搭伙金库」开关的变更处理：勾选时展开人均金额栏位
 * @param {HTMLInputElement} checkbox
 */
function onPoolToggleChange(checkbox) {
  const amountGroup = document.getElementById('poolAmountGroup');
  if (amountGroup) {
    amountGroup.classList.toggle('is-hidden', !checkbox.checked);
  }
}

/* ------------------------------------------------------------
   11. 渲染：Expenses 页
   ------------------------------------------------------------ */

function initExpenseFilters() {
  document.getElementById('expenseSearchInput').addEventListener('input', debounce((event) => {
    currentSearchKeyword = event.target.value.trim().toLowerCase();
    renderExpensesTable();
  }, 180));
}

function renderCategoryFilterChips() {
  const container = document.getElementById('categoryFilterChips');
  container.innerHTML = `<button class="chip is-active" data-category-filter="all" type="button">${escapeHtml(t('expenses.filterAll'))}</button>`;

  appState.categories.forEach((category) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('data-category-filter', category.name);
    // 自定义分类给一个极轻微的小圆点标记（见 .chip-custom-dot），暗示「这是你
    // 自己加的」——刻意不用不同颜色/边框，那样在一整排 chip 里会喧宾夺主
    chip.innerHTML = (category.tripId ? '<span class="chip-custom-dot" aria-hidden="true"></span>' : '')
      + escapeHtml(translateCategory(category.name));
    container.appendChild(chip);
  });

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentCategoryFilter = chip.getAttribute('data-category-filter');
      renderExpensesTable();
    });
  });
}

// 大批量消费记录分页：账目页一次最多只画这么多行，其余的等使用者点「载入更多」才补上去。
// 旅程拖长、消费笔数一多，手机浏览器一次塞进几百个复杂 DOM 节点会让筛选/切换分类明显卡顿，
// 分页可以把「每次筛选都要重绘的节点数」限制在一个固定、够小的上限
const EXPENSES_LIST_PAGE_SIZE = 40;

// 账目页目前「已经渲染出来」的笔数（不是总笔数）；筛选条件一变就重设回第一页，
// 只有「载入更多」按钮自己点击时才会往上累加
let expensesListRenderedCount = EXPENSES_LIST_PAGE_SIZE;

/**
 * 幫每笔消费算出（並快取）一个小写的「可搜索文本」——把账目页搜索框实际
 * 要覆盖的所有欄位（说明、备注、付款人、分类的原始值+目前语言翻译值、
 * 参与人姓名、金额、日期）攤平成一个字串，搜索时只要对这一个字串做
 * includes() 就好，不用每个欄位分开比对一次。
 *
 * 快取直接挂在 expense 物件自己身上（_searchText / _searchTextLang），不用
 * 另外维护一份 id -> 文本的对照表：新增/编辑/删除都会产生全新的物件实例
 * （见 expenseRowToOldShape_() 与各处 splice/push），不是原地修改既有物件，
 * 所以只要语言没变、这个物件实例本身没被换掉，快取就还有效——只有第一次
 * 遇到这个物件、或语言切换後第一次遇到它，才会真的重新调用 translateCategory()
 * 这类相对昂贵的函式，不会每次按键、每一行都重算一次
 * @param {Object} expense
 * @return {string}
 */
function getExpenseSearchText_(expense) {
  if (expense._searchText !== undefined && expense._searchTextLang === currentLang) {
    return expense._searchText;
  }

  const parts = [
    expense.Description,
    expense.Remark,
    getExpensePayerDisplay(expense.Payer),
    expense.Category, // 原始值（例如 'Hotel'）——使用者可能直接记得英文代号
    translateCategory(expense.Category), // 目前语言的翻译值（例如「住宿」），
    // 这样切换语言後用另一种语言的分类名一样搜得到，不用等重新整理
    (expense.Participants || []).join(' '),
    expense.Amount,
    expense.Date // 原始 "YYYY-MM-DD"，天然支援「10-15」「2026-10」这类部分匹配，
    // 不需要额外格式化
  ];

  const searchText = parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' ')
    .toLowerCase();

  expense._searchText = searchText;
  expense._searchTextLang = currentLang;
  return searchText;
}

/**
 * 判断一笔消费是否符合目前的搜索关键字。支援空格分隔的多个词，全部要符合
 * 才算通过（AND，例如「阿明 餐饮」= 阿明付的餐饮）。每个词可以是：
 *   - 一般文字／数字：对 getExpenseSearchText_() 的可搜索文本做 includes()
 *   - "＞100" / "＜50" 这种简单数字比较：只比对金额。做这个是因为金额是
 *     使用者最常「大概记得、不记得精确数字」的欄位（例如记得「那笔应该蛮貴的」
 *     但不记得是 1280 还是 1380），比起要求先猜出精确数字才能用文字包含比对
 *     搜到，允许简单的大于/小于会实用很多；判断逻辑很单纯（一个正则 + 一次
 *     数字比较），不会拖慢筛选速度
 * @param {Object} expense
 * @param {string} keyword 已经 trim + toLowerCase 过的搜索字串（见
 *   initExpenseFilters() 的 input 监听器）
 * @return {boolean}
 */
function expenseMatchesKeyword_(expense, keyword) {
  if (!keyword) {
    return true;
  }

  const terms = keyword.split(/\s+/).filter(Boolean);
  const searchText = getExpenseSearchText_(expense);

  return terms.every((term) => {
    const comparison = term.match(/^([<>])(\d+(?:\.\d+)?)$/);
    if (comparison) {
      const threshold = Number(comparison[2]);
      return comparison[1] === '>' ? expense.Amount > threshold : expense.Amount < threshold;
    }
    return searchText.includes(term);
  });
}

/**
 * 依目前的分类/分账方式/关键字筛选条件，算出账目页要显示的消费清单（新到旧排序）
 * @return {Array<Object>}
 */
function getFilteredExpensesForList() {
  return appState.expenses.filter((expense) => {
    const matchCategory = currentCategoryFilter === 'all' || expense.Category === currentCategoryFilter;
    const matchSplitType = currentSplitTypeFilter === 'all' || expense.SplitType === currentSplitTypeFilter;
    const matchKeyword = expenseMatchesKeyword_(expense, currentSearchKeyword);

    return matchCategory && matchSplitType && matchKeyword;
  }).sort((a, b) => new Date(b.Date) - new Date(a.Date));
}

/**
 * 组出单一笔消费在账目列表里的那一行 HTML。离线时暂存、还没同步到後端的那笔
 * （expense._pendingSync === true，见「离线记账」章节）会多一个「待同步」徽章、
 * 视觉上稍微淡化。
 *
 * 删除只能从点进去的「消费明细」Modal 里做（会先跳确认视窗）——列表这里不做滑动删除，
 * 这类一划就露出删除按钮的手势在手机上太容易被误触，点进去再删更安全
 * @param {Object} expense
 * @return {string}
 */
function buildExpenseRowHtml(expense) {
  const iconMeta = getCategoryIconMeta(expense.Category);
  const isPending = expense._pendingSync === true;

  return `
    <div class="expense-row${isPending ? ' is-pending-sync' : ''}" data-expense-id="${escapeHtml(expense.ID)}" role="button" tabindex="0">
      <div class="activity-icon ${iconMeta.cls}" aria-hidden="true">${iconMeta.svg}</div>
      <div class="expense-row-info">
        <p class="expense-row-title">${escapeHtml(expense.Description || translateCategory(expense.Category))}${isPending ? ` <span class="badge badge-warning">${escapeHtml(t('offline.pendingBadge'))}</span>` : ''}</p>
        <p class="expense-row-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))}</p>
      </div>
      <p class="expense-row-amount mono">${formatExpenseAmountDisplay(expense)}</p>
      <svg class="expense-row-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
  `;
}

/**
 * 渲染账目页的消费列表：单栏卡片式，一行一笔（图示＋说明/付款人/日期＋金额），
 * 点击整行会打开「消费明细」Modal 看完整分摊，编辑/删除都移到那个 Modal 里，
 * 这里保持精简，小屏幕也能舒服地一眼看完
 * @param {boolean} [resetPage=true] 是否把「已渲染笔数」重设回第一页——筛选条件变了、
 *   资料整批换新时要传 true（或不传，预设就是 true）；只有「载入更多」按钮自己点击时
 *   会传 false，改成往下补渲染下一批，不重画已经在畫面上的那些行
 */
function renderExpensesTable(resetPage = true) {
  togglePageEmptyHero_('expensesEmptyHero', 'expensesNormalContent', false);

  if (resetPage) {
    expensesListRenderedCount = EXPENSES_LIST_PAGE_SIZE;
  }

  const filtered = getFilteredExpensesForList();

  if (filtered.length === 0) {
    const hasAnyExpense = appState.expenses.length > 0;
    renderEmptyBlock(
      'expensesList',
      hasAnyExpense ? t('empty.noMatchingExpenses.title') : t('empty.noExpenses.title'),
      hasAnyExpense ? t('empty.noMatchingExpenses.desc') : t('empty.noExpenses.desc'),
      hasAnyExpense ? undefined : 'addExpenseModal',
      hasAnyExpense ? undefined : t('header.addExpense')
    );
    return;
  }

  const container = document.getElementById('expensesList');
  const visible = filtered.slice(0, expensesListRenderedCount);

  container.innerHTML = visible.map(buildExpenseRowHtml).join('');

  container.querySelectorAll('.expense-row[data-expense-id]').forEach((row) => {
    const expenseId = row.getAttribute('data-expense-id');
    const expense = visible.find((item) => item.ID === expenseId);

    if (expense && expense._pendingSync) {
      return; // 还没同步到後端、连正式 ID 都没有的暂存纪录，先不给点开看明细/编辑
    }

    const openHandler = () => openExpenseDetailModal(expenseId);
    row.addEventListener('click', openHandler);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openHandler();
      }
    });
  });

  renderExpensesLoadMoreButton(container, filtered.length);
}

/**
 * 在消费列表最下面视需要补一颗「载入更多」按钮——目前筛选条件下还有没显示完的笔数才会出现，
 * 点一下只把「已渲染笔数」往上累加、重新跑一次 renderExpensesTable(false)，
 * 用来补下一批，不会重画已经在畫面上的那些行
 * @param {HTMLElement} container #expensesList
 * @param {number} totalCount 目前筛选条件下的总笔数
 */
function renderExpensesLoadMoreButton(container, totalCount) {
  if (expensesListRenderedCount >= totalCount) {
    return;
  }

  const remaining = totalCount - expensesListRenderedCount;
  const wrap = document.createElement('div');
  wrap.className = 'expense-list-load-more';
  wrap.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" id="expensesLoadMoreBtn">${escapeHtml(t('expenses.loadMore', { count: remaining }))}</button>`;
  container.appendChild(wrap);

  document.getElementById('expensesLoadMoreBtn').addEventListener('click', () => {
    expensesListRenderedCount += EXPENSES_LIST_PAGE_SIZE;
    renderExpensesTable(false);
  });
}

/**
 * 打开「消费明细」Modal：显示这笔消费完整的分摊明细（每位参与人分摊多少，
 * 用跟表单同一套 calculateExpenseSplitClientSide 算，四种分账方式都对得上）。
 * 编辑/删除按钮只有「当事人」（expense.CanManage，后端依 CreatedByUserId 判断）才看得到，
 * 不是自己建立的消费，这里只能看不能动
 * @param {string} expenseId 消费纪录 ID
 */
function openExpenseDetailModal(expenseId) {
  const expense = appState.expenses.find((item) => item.ID === expenseId);
  if (!expense) {
    showToast('error', t('toast.recordNotFound'), t('toast.recordNotFoundMsg'));
    return;
  }

  document.getElementById('expenseDetailTitle').textContent = expense.Description || t('expense.noDescription');
  document.getElementById('expenseDetailSubtitle').textContent = t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) });
  document.getElementById('expenseDetailAmount').innerHTML = formatExpenseAmountDisplay(expense);

  const splitBadge = getSplitTypeBadgeInfo(expense.SplitType);
  document.getElementById('expenseDetailBadges').innerHTML = `
    <span class="badge badge-accent">${escapeHtml(translateCategory(expense.Category))}</span>
    <span class="badge ${splitBadge.className}">${escapeHtml(splitBadge.label)}</span>
  `;

  const remarkEl = document.getElementById('expenseDetailRemark');
  if (expense.Remark) {
    remarkEl.textContent = expense.Remark;
    remarkEl.classList.remove('is-hidden');
  } else {
    remarkEl.classList.add('is-hidden');
  }

  // 收据照片：对所有成员开放预览，不比照编辑权限做限制——之前这个弹窗完全没放
  // 收据，只有记录建立者打开编辑表单才看得到，其他成员根本无从预览
  const receiptWrap = document.getElementById('expenseDetailReceiptWrap');
  if (expense.Receipt) {
    document.getElementById('expenseDetailReceiptImg').src = expense.Receipt;
    receiptWrap.classList.remove('is-hidden');
  } else {
    receiptWrap.classList.add('is-hidden');
  }

  const splitResult = calculateExpenseSplitClientSide(expense);
  // 金库支出没有真正的 Participants（SplitType='pool'，钱是从公共账户直接出的），
  // 但对使用者来说，这笔钱本来就是「全体成员均摊」的消费，分摊明细直接比照均分显示，
  // 不要因为技术上没有 Participants 栏位就让这个区块开天窗
  const isPoolExpense = expense.SplitType === 'pool';
  const participants = isPoolExpense ? appState.members : (expense.Participants || []);
  const poolShare = isPoolExpense ? Number(expense.Amount) / (appState.members.length || 1) : 0;

  document.getElementById('expenseDetailSplitList').innerHTML = participants.map((name) => {
    const share = isPoolExpense ? poolShare : (splitResult[name] !== undefined ? splitResult[name] : 0);
    const isPayer = name === expense.Payer;
    return `
      <div class="balance-row">
        <div class="avatar">${escapeHtml(getInitials(name))}</div>
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(name)}</p>
          ${isPayer ? `<p class="balance-sub">${escapeHtml(t('expenseDetailModal.payerTag'))}</p>` : ''}
        </div>
        <p class="balance-amount mono">${escapeHtml(formatMoney(share, expense.Currency))}</p>
      </div>
    `;
  }).join('');

  const footer = document.getElementById('expenseDetailFooter');
  footer.classList.toggle('is-hidden', !expense.CanManage);

  if (expense.CanManage) {
    const editBtn = document.getElementById('expenseDetailEditBtn');
    const freshEditBtn = editBtn.cloneNode(true);
    editBtn.parentNode.replaceChild(freshEditBtn, editBtn);
    freshEditBtn.addEventListener('click', () => {
      closeSecondaryPage_();
      openExpenseFormForEdit(expenseId);
    });

    const deleteBtn = document.getElementById('expenseDetailDeleteBtn');
    const freshDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(freshDeleteBtn, deleteBtn);
    freshDeleteBtn.addEventListener('click', () => {
      handleDeleteExpenseClick(expenseId, expense.Description || translateCategory(expense.Category));
    });
  }

  showSecondaryPage_('expense-detail');
}


/* ------------------------------------------------------------
   12. 渲染：Summary 页
   ------------------------------------------------------------ */

function renderSummaryPage() {
  togglePageEmptyHero_('summaryEmptyHero', 'summaryNormalContent', false);

  // 旅程本身是有的，只是完全还没有任何消费纪录——换成小巧的引导区块，
  // 「每人收支」「最优结算」「还款记录」三个面板都还没有意义可言，不要
  // 让人对着三个各自空空的面板
  const noDataBlock = document.getElementById('summaryNoDataBlock');
  const normalContent = document.getElementById('summaryNormalContent');
  const hasNoExpenses = appState.expenses.length === 0;
  if (noDataBlock) noDataBlock.style.display = hasNoExpenses ? '' : 'none';
  if (normalContent) normalContent.classList.toggle('is-hidden', hasNoExpenses);
  if (hasNoExpenses) {
    return;
  }

  const balances = appState.summary.balances || [];
  const settlements = appState.summary.settlements || [];

  const settleAllBtn = document.getElementById('settleAllBtn');
  if (settleAllBtn) {
    const realSettlementCount = settlements.filter((item) => !item.isPoolSettlement).length;
    settleAllBtn.classList.toggle('is-hidden', realSettlementCount === 0);
  }

  if (balances.length === 0) {
    renderEmptyBlock('balanceList', t('empty.noBalance.title'), t('empty.noBalance.desc'));
  } else {
    const baseCurrency = (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR';
    const container = document.getElementById('balanceList');
    container.innerHTML = balances.map((item) => {
      const balanceClass = item.balance > AMOUNT_TOLERANCE ? 'is-positive' : (item.balance < -AMOUNT_TOLERANCE ? 'is-negative' : 'is-zero');
      const balanceLabel = item.balance > AMOUNT_TOLERANCE ? t('memberStats.receivable') : (item.balance < -AMOUNT_TOLERANCE ? t('memberStats.payable') : t('memberStats.settled'));

      // 已付金额／个人消费／已收金额，统一跟 Hero Card／PDF 报告用同一套算法
      // （见 computeMemberPoolShares_ 的说明），这样不管在哪个画面看到的数字都一致
      const poolShares = computeMemberPoolShares_(item.name);
      const frontedBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.paid + (item.repaid || 0), poolShares.topupBreakdown);
      const personalBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.shouldPay, poolShares.consumptionBreakdown);
      const receivedBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.received, poolShares.refundBreakdown);

      return `
        <div class="balance-row">
          <div class="avatar">${escapeHtml(getInitials(item.name))}</div>
          <div class="balance-info">
            <p class="balance-name">${escapeHtml(item.name)}</p>
            <p class="balance-sub">${escapeHtml(t('hero.frontedLabel'))} ${escapeHtml(formatCurrencyBreakdownText(frontedBreakdown))} · ${escapeHtml(t('hero.personalLabel'))} ${escapeHtml(formatCurrencyBreakdownText(personalBreakdown))} · ${escapeHtml(t('hero.receivedLabel'))} ${escapeHtml(formatCurrencyBreakdownText(receivedBreakdown))}</p>
          </div>
          <div>
            <p class="balance-amount mono ${balanceClass}">${formatMoney(Math.abs(item.balance))}</p>
            <p class="balance-sub" style="text-align:right;">${balanceLabel}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // 结算页面的「建议还款」显示完整清单（所有人跟所有人），不像 Dashboard 首页的
  // 「谁欠谁」那样只筛跟自己有关的——这里是给管理这趟旅程的人看全貌用的，
  // Dashboard 首页那个才是给个人快速看「我该处理什么」用的，两处用途不同。
  // 走到这里一定是「有消费纪录」（没有消费纪录的话，函式最前面已经 return 了），
  // 所以 settlements.length===0 只可能是「都已经结清」，不用再判断一次
  const settlementPanel = document.getElementById('settlementPanel');
  if (settlements.length === 0) {
    // 有消费纪录、但大家都已经结清——这个 section 已经没有任何要处理的事，
    // 直接整块藏起来，不留一个「都平衡了」的空状态占位置
    if (settlementPanel) settlementPanel.classList.add('is-hidden');
  } else {
    if (settlementPanel) settlementPanel.classList.remove('is-hidden');
    const container = document.getElementById('settlementList');
    // 点击整排直接去还款（不再是滑动才看得到的按钮）——「搭伙金库」这个虚拟
    // 参与者的转账建议不能真的去记还款，那一排不给点击样式、也不绑事件
    container.innerHTML = settlements.map((item, index) => {
      const isPool = item.isPoolSettlement;
      return `
      <div class="settlement-row${isPool ? '' : ' is-clickable'}" ${isPool ? '' : `data-settlement-index="${index}" role="button" tabindex="0" aria-label="${escapeHtml(t('settlement.goRepay'))}"`}>
        <div class="settlement-flow">
          <span>${escapeHtml(getExpensePayerDisplay(item.from))}</span>
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12H20M14 6L20 12L14 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>${escapeHtml(getExpensePayerDisplay(item.to))}</span>
        </div>
        <p class="settlement-amount mono">${formatMoney(item.amount)}</p>
        ${isPool
          ? `<span class="badge badge-info">${escapeHtml(t('settlement.poolOffsetBadge'))}</span>`
          : ''}
      </div>
    `;
    }).join('');

    const goRepay = (row) => {
      const item = settlements[Number(row.getAttribute('data-settlement-index'))];
      openRepaymentModalPrefilled(item.from, item.to, item.amount);
    };
    container.querySelectorAll('.settlement-row.is-clickable').forEach((row) => {
      row.addEventListener('click', () => goRepay(row));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goRepay(row);
        }
      });
    });
  }

  renderRepaymentList();
}

// 还款纪录预设只显示「跟我有关」的（我是还款人或收款人），点面板里的
// 「查看全部」才展开看整趟旅程所有人的纪录——RLS 本来就允许所有成员读到
// 全部资料，这里纯粹是预设显示的筛选，不是真的藏起来。切换旅程时归零，
// 每趟旅程一开始都从「只看与我相关」开始，不会不小心带着上一趟的展开状态
let repaymentScopeShowAll_ = false;

/**
 * 渲染「还款纪录」列表；编辑/删除按钮只有「当事人」（item.CanManage，后端依
 * CreatedByUserId／收款人身份判断）才看得到，其他人这里只能看不能动
 * （删除后会重新计算结算总览）
 */
function renderRepaymentList() {
  const allRepayments = [...appState.repayments].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const repaymentPanel = document.getElementById('repaymentPanel');

  if (allRepayments.length === 0) {
    // 还没有任何一笔实际转帐纪录——不留这个 section 的空状态占位置，
    // 要还款可以直接从上面「最优结算」的建议里点，真正记录了一笔之後
    // 这个 section 才会冒出来，跟「最优结算」结清後隐藏是同一种处理方式
    if (repaymentPanel) repaymentPanel.classList.add('is-hidden');
    return;
  }
  if (repaymentPanel) repaymentPanel.classList.remove('is-hidden');

  const viewerName = getViewerName();
  const isRelatedToViewer = (item) => !!viewerName && (item.FromMember === viewerName || item.ToMember === viewerName);
  const hasOthers = allRepayments.some((item) => !isRelatedToViewer(item));

  const toggleBtn = document.getElementById('repaymentScopeToggleBtn');
  if (toggleBtn) {
    if (!hasOthers) {
      // 全部都跟我有关，没有「其他人」可以展开看，切换钮不显示，
      // 不然会是一颗点了也没反应的按钮
      toggleBtn.classList.add('is-hidden');
    } else {
      toggleBtn.classList.remove('is-hidden');
      const key = repaymentScopeShowAll_ ? 'summary.repaymentShowMine' : 'summary.repaymentShowAll';
      toggleBtn.setAttribute('data-i18n', key);
      toggleBtn.textContent = t(key);
      toggleBtn.onclick = () => {
        repaymentScopeShowAll_ = !repaymentScopeShowAll_;
        renderRepaymentList();
      };
    }
  }

  const repayments = (repaymentScopeShowAll_ || !hasOthers)
    ? allRepayments
    : allRepayments.filter(isRelatedToViewer);

  const container = document.getElementById('repaymentList');

  if (repayments.length === 0) {
    // 全部旅程的还款纪录都存在（allRepayments.length > 0），只是没有一笔
    // 跟我有关——维持面板开着（上面的「查看全部」还在，点了就看得到），
    // 不要整块面板一起藏起来，不然使用者会以为这趟旅程根本没有还款纪录
    renderEmptyBlock('repaymentList', t('summary.repaymentNoneRelated'), '');
    return;
  }

  // 点击整排（只有当事人 CanManage 才能点）开一个小选单选「编辑」或「删除」，
  // 不再是滑动才看得到的圖示——不能管的那排就是纯展示，不给点击样式
  container.innerHTML = repayments.map((item) => {
    const clickable = item.CanManage;
    return `
    <div class="settlement-row${clickable ? ' is-clickable' : ''}" ${clickable ? `data-repayment-id="${escapeHtml(item.ID)}" role="button" tabindex="0"` : ''}>
      <div class="settlement-flow">
        <span>${escapeHtml(item.FromMember)}</span>
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 12H20M14 6L20 12L14 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>${escapeHtml(item.ToMember)}</span>
      </div>
      <p class="settlement-amount mono">${formatMoney(item.Amount)}</p>
    </div>
  `;
  }).join('');

  container.querySelectorAll('.settlement-row.is-clickable[data-repayment-id]').forEach((row) => {
    const open = () => openRepaymentActionModal(row.getAttribute('data-repayment-id'));
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

/**
 * 点击还款纪录那一排跳出来的小选单——「编辑」直接沿用既有的编辑表单，
 * 「删除」沿用既有的二次确认流程，这里只负责「点了要做什么」的第一层选择
 * @param {string} repaymentId
 */
function openRepaymentActionModal(repaymentId) {
  const repayment = appState.repayments.find((item) => item.ID === repaymentId);
  if (!repayment) {
    showToast('error', t('toast.recordNotFound'), t('toast.recordNotFoundMsg'));
    return;
  }

  document.getElementById('repaymentActionSubtitle').textContent =
    `${repayment.FromMember} → ${repayment.ToMember} · ${formatMoney(repayment.Amount)}`;

  const editBtn = document.getElementById('repaymentActionEditBtn');
  const freshEditBtn = editBtn.cloneNode(true);
  editBtn.parentNode.replaceChild(freshEditBtn, editBtn);
  freshEditBtn.addEventListener('click', () => {
    closeActiveModal();
    openEditRepaymentModal(repaymentId);
  });

  const deleteBtn = document.getElementById('repaymentActionDeleteBtn');
  const freshDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(freshDeleteBtn, deleteBtn);
  freshDeleteBtn.addEventListener('click', () => {
    closeActiveModal();
    const label = `${repayment.FromMember} → ${repayment.ToMember}`;
    handleDeleteRepaymentClick(repaymentId, label);
  });

  openModal('repaymentActionModal');
}

/**
 * 打开「编辑还款纪录」Modal，把这笔既有还款的资料带进单纯的编辑表单——
 * 跟「记录还款」那个可以一次勾多人分别新增多笔的表单不同，这里一次只改一笔既有纪录
 * @param {string} repaymentId 还款纪录 ID
 */
function openEditRepaymentModal(repaymentId) {
  const repayment = appState.repayments.find((item) => item.ID === repaymentId);
  if (!repayment) {
    showToast('error', t('toast.recordNotFound'), t('toast.recordNotFoundMsg'));
    return;
  }

  const fromSelect = document.getElementById('editRepaymentFrom');
  const toSelect = document.getElementById('editRepaymentTo');

  [fromSelect, toSelect].forEach((select) => {
    select.innerHTML = `<option value="" disabled>${escapeHtml(t('repayment.selectMember'))}</option>`;
    appState.members.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });

  fromSelect.value = repayment.FromMember;
  toSelect.value = repayment.ToMember;
  document.getElementById('editRepaymentAmount').value = repayment.Amount;
  document.getElementById('editRepaymentDate').value = formatDateForInput(new Date(repayment.Date));
  document.getElementById('editRepaymentRemark').value = repayment.Remark || '';
  document.getElementById('editRepaymentForm').dataset.repaymentId = repaymentId;

  openModal('editRepaymentModal');
}

/**
 * 绑定「编辑还款纪录」表单的送出事件
 */
function initEditRepaymentForm() {
  document.getElementById('editRepaymentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    handleEditRepaymentFormSubmit();
  });
}

/**
 * 送出「编辑还款纪录」表单
 */
async function handleEditRepaymentFormSubmit() {
  const form = document.getElementById('editRepaymentForm');
  const repaymentId = form.dataset.repaymentId;
  const submitBtn = document.getElementById('editRepaymentSubmitBtn');

  const fromMember = document.getElementById('editRepaymentFrom').value;
  const toMember = document.getElementById('editRepaymentTo').value;
  const amount = document.getElementById('editRepaymentAmount').value;
  const date = document.getElementById('editRepaymentDate').value;
  const remark = document.getElementById('editRepaymentRemark').value.trim();

  if (!fromMember || !toMember) {
    showToast('error', t('toast.pleaseSelectRecipient'), '');
    return;
  }
  if (fromMember === toMember) {
    showToast('error', t('toast.repayerSameAsRecipient'), '');
    return;
  }
  if (!amount || Number(amount) <= 0) {
    showToast('error', t('toast.repayerAmountRequired'), '');
    return;
  }

  setButtonLoading(submitBtn, true);

  try {
    const row = translateRepaymentPayloadForWrite_({ fromMember, toMember, amount, date, remark, isNew: false });
    const { error } = await supabaseClient.from('repayments').update(row).eq('id', repaymentId);
    if (error) throw error;
    closeModal_('editRepaymentModal');
    await refreshRepayments();
  } catch (error) {
    showToast('error', t('toast.saveFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}


/* ------------------------------------------------------------
   13. 渲染：Members 页
   ------------------------------------------------------------ */

/**
 * 依成员姓名取得「财务状态徽章」的文字与语意（已结清 / 待收 / 待付）
 * 找不到结算资料（例如刚新增、尚无消费）时，一律视为已结清。
 * 待清算的方向（isReceivable）刻意跟结算页 .balance-amount.is-positive／
 * is-negative 用同一份 balance 正负号判断、同一组 --success／--danger 颜色，
 * 不然使用者在结算页学会「绿色=别人欠你、红色=你欠别人」，切到同行页看到的
 * 却是不分方向、一律琥珀色的「Pending」，同一件事两种颜色语言，容易误读
 * @param {string} name 成员姓名
 * @return {{text: string, isSettled: boolean, isReceivable: boolean}}
 */
function getMemberStatusBadge(name) {
  const stat = (appState.summary.balances || []).find((item) => item.name === name);
  const balance = stat ? Number(stat.balance || 0) : 0;

  if (Math.abs(balance) <= AMOUNT_TOLERANCE) {
    // 已结清：不再用「财务平衡，心照不宣」这类俏皮文案，改为直接显示消费合计（绿色字体，见 .member-card-status.is-settled）
    const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
    const shouldPay = stat ? Number(stat.shouldPay || 0) : 0;
    return { text: t('memberStatus.settled', { amount: formatMoney(shouldPay, baseCurrency) }), isSettled: true, isReceivable: false };
  }

  return { text: t('memberStatus.pending', { amount: formatMoney(Math.abs(balance)) }), isSettled: false, isReceivable: balance > 0 };
}

function renderMembersPage() {
  togglePageEmptyHero_('membersEmptyHero', 'membersNormalContent', false);

  renderDuplicateMemberBanner();

  const members = appState.members;

  if (members.length === 0) {
    renderEmptyBlock('memberGrid', t('empty.noMembers.title'), t('empty.noMembers.desc'));
    return;
  }

  const expenseCountByMember = computeExpenseCountByMember();

  const container = document.getElementById('memberGrid');
  container.innerHTML = members.map((name) => {
    const status = getMemberStatusBadge(name);
    return `
    <div class="member-card member-card-clickable" data-member-card="${escapeHtml(name)}" role="button" tabindex="0">
      <div class="avatar">${escapeHtml(getInitials(name))}</div>
      <div class="member-card-info">
        <p class="member-card-name">${escapeHtml(name)}</p>
        <p class="member-card-meta">${escapeHtml(t('members.participatedIn', { count: expenseCountByMember[name] || 0 }))}</p>
        <p class="member-card-status ${status.isSettled ? 'is-settled' : (status.isReceivable ? 'is-receivable' : 'is-payable')}">
          <span class="member-card-status-dot" aria-hidden="true"></span>${escapeHtml(status.text)}
        </p>
      </div>
      <button class="icon-btn" type="button" data-delete-member="${escapeHtml(name)}" aria-label="${escapeHtml(t('aria.deleteMember'))}">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9.5 7V4.8C9.5 4.4 9.8 4 10.3 4H13.7C14.2 4 14.5 4.4 14.5 4.8V7M17.5 7L16.9 18.5C16.9 19.3 16.2 20 15.4 20H8.6C7.8 20 7.1 19.3 7.1 18.5L6.5 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  }).join('');

  container.querySelectorAll('[data-delete-member]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation(); // 避免同时触发卡片本身的点击（打开个人明细）
      handleDeleteMemberClick(button.getAttribute('data-delete-member'));
    });
  });

  container.querySelectorAll('[data-member-card]').forEach((card) => {
    const openHandler = () => openMemberDetailPage(card.getAttribute('data-member-card'));
    card.addEventListener('click', openHandler);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openHandler();
      }
    });
  });
}

/**
 * 渲染同行页顶端的「合并重复成员」提示banner：这趟旅程有还没连结账号的旧成员时才显示，
 * 没有的话就隐藏（不占位置、不打扰）
 */
function renderDuplicateMemberBanner() {
  const banner = document.getElementById('duplicateMemberBanner');
  if (!banner) {
    return;
  }

  const hasUnclaimed = (appState.unclaimedMembers || []).length > 0;
  banner.classList.toggle('is-hidden', !hasUnclaimed);
}

/**
 * 绑定同行页「合并重复成员」banner 上的「查看」按钮
 */
function initDuplicateMemberBanner() {
  const button = document.getElementById('reviewDuplicateMembersBtn');
  if (button) {
    button.addEventListener('click', openMergeMemberModal);
  }
}

/**
 * 打开「合并重复成员」Modal，列出这趟旅程里所有还没连结账号的旧成员，
 * 让使用者从中挑出「这是我」，把旧纪录合并进自己身上
 */
function openMergeMemberModal() {
  const list = appState.unclaimedMembers || [];

  if (list.length === 0) {
    renderEmptyBlock('mergeMemberList', t('mergeMemberModal.empty.title'), t('mergeMemberModal.empty.desc'));
    openModal('mergeMemberModal');
    return;
  }

  const container = document.getElementById('mergeMemberList');
  container.innerHTML = list.map((item) => `
    <div class="balance-row">
      <div class="avatar">${escapeHtml(getInitials(item.name))}</div>
      <div class="balance-info">
        <p class="balance-name">${escapeHtml(item.name)}</p>
      </div>
      <button class="btn btn-secondary btn-sm merge-member-btn" type="button" data-merge-member-id="${escapeHtml(item.memberId)}" data-merge-member-name="${escapeHtml(item.name)}">${escapeHtml(t('mergeMemberModal.confirmBtn'))}</button>
    </div>
  `).join('');

  container.querySelectorAll('.merge-member-btn').forEach((button) => {
    button.addEventListener('click', () => {
      handleMergeMemberClick(button.getAttribute('data-merge-member-id'), button.getAttribute('data-merge-member-name'));
    });
  });

  openModal('mergeMemberModal');
}

/**
 * 确认后呼叫 mergeMemberIntoSelf，把选定的旧成员合并进「呼叫者自己」身上——
 * 合并牵动 Expenses/Repayments 的显示名称，所以成功后直接整个重新载入这趟旅程的资料，
 * 不只是局部刷新成员清单
 * @param {string} memberId 要合并的旧 MemberID
 * @param {string} name 旧成员当初的名字（给确认文字显示用）
 */
function handleMergeMemberClick(memberId, name) {
  openConfirmModal(t('confirm.mergeMember', { name }), async () => {
    const { error } = await supabaseClient.rpc('merge_member_into_self', {
      _trip_id: currentTripId,
      _source_member_id: memberId
    });
    if (error) throw error;
    showToast('success', t('toast.memberMerged'), t('toast.memberMergedMsg', { name }));
    closeActiveModal();
    renderDashboardSkeleton(); // Modal 先关了，接下来的整趟旅程重新载入没有别的进度指示，用骨架屏顶著
    try {
      await loadTripData();
    } catch (error) {
      clearHeroCardSkeletonToEmpty_();
      renderApiErrorState(error.message);
      throw error; // 继续往外丢给 openConfirmModal 的 catch，让它照原本行为跳错误 toast
    }
  }, {
    title: t('confirm.mergeMemberTitle'),
    confirmLabel: t('confirm.mergeMemberLabel')
    // danger 维持预设 true：合并是真的不可逆、会让旧纪录消失，跟删除同等级的警示是对的
  });
}


/**
 * 计算每位成员参与了几笔消费（不分谁付款，只要是参与人就算一笔）
 * @return {Object} { name: count, ... }
 */
function computeExpenseCountByMember() {
  const idToName = (appState.memberIndex && appState.memberIndex.byId) || {};
  const countById = {};

  appState.expenses.forEach((expense) => {
    (expense.ParticipantIds || []).forEach((id) => {
      countById[id] = (countById[id] || 0) + 1;
    });
  });

  const expenseCountByMember = {};
  Object.keys(countById).forEach((id) => {
    const name = idToName[id];
    if (name) {
      expenseCountByMember[name] = countById[id];
    }
  });
  return expenseCountByMember;
}

/**
 * 打开「消费记录」Modal，列出这个旅程所有的消费纪录（依日期由新到旧排序）
 */
function openAllExpensesModal() {
  const expenses = [...appState.expenses].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const totalBreakdown = groupAmountsByCurrency(expenses, (item) => item.Amount, (item) => item.Currency);
  const totalText = totalBreakdown.map((item) => formatMoney(item.total, item.currency)).join(' + ') || formatMoney(0);

  document.getElementById('allExpensesSubtitle').textContent = t('allExpenses.subtitle', { count: expenses.length, total: totalText });

  const listContainer = document.getElementById('allExpensesList');

  if (expenses.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state empty-state-compact">
        <div class="empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none"><rect x="14" y="10" width="36" height="46" rx="6" stroke="currentColor" stroke-width="2"/><path d="M22 24H42M22 32H42M22 40H34" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3>${escapeHtml(t('empty.noExpenses.title'))}</h3>
        <p>${escapeHtml(t('empty.noExpenses.desc'))}</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = expenses.map((expense) => `
      <div class="balance-row">
        <div class="avatar">${escapeHtml(getInitials(expense.Payer))}</div>
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
          <p class="balance-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))} · ${escapeHtml(translateCategory(expense.Category))}</p>
        </div>
        <p class="balance-amount mono">${formatExpenseAmountDisplay(expense)}</p>
      </div>
    `).join('');
  }

  showSecondaryPage_('all-expenses');
}

/**
 * 打开「建议还款」Modal，内容跟结算总览页的「最佳还款建议」一致——但这里
 * 纯粹是给使用者快速看一眼「最少转账次数该怎么转」，不提供「去还款」的
 * 点击动作（真的要记录还款，去结算页那边点），单纯展示用
 */
function openSettlementSuggestionsModal() {
  const settlements = appState.summary.settlements || [];
  const listContainer = document.getElementById('settlementSuggestionsList');

  if (settlements.length === 0) {
    const emptyTitle = appState.expenses.length === 0 ? t('empty.noExpenses.title') : t('settlementModal.empty.title');
    const emptyDesc = appState.expenses.length === 0 ? t('empty.noExpenses.desc') : t('settlementModal.empty.desc');
    listContainer.innerHTML = `
      <div class="empty-state empty-state-compact">
        <div class="empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="2"/><path d="M26 32L30 36L38 27" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h3>${escapeHtml(emptyTitle)}</h3>
        <p>${escapeHtml(emptyDesc)}</p>
      </div>
    `;
    showSecondaryPage_('settlement-suggestions');
    return;
  }

  listContainer.innerHTML = settlements.map((item) => `
    <div class="settlement-row">
      <div class="settlement-flow">
        <span>${escapeHtml(getExpensePayerDisplay(item.from))}</span>
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 12H20M14 6L20 12L14 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>${escapeHtml(getExpensePayerDisplay(item.to))}</span>
      </div>
      <p class="settlement-amount mono">${formatMoney(item.amount)}</p>
      ${item.isPoolSettlement
        ? `<span class="badge badge-info">${escapeHtml(t('settlement.poolOffsetBadge'))}</span>`
        : ''}
    </div>
  `).join('');

  showSecondaryPage_('settlement-suggestions');
}

/**
 * 打开「账单统计」二级页面（Dashboard Quick Actions Dock 的「📈 账单统计」）
 * 只保留「分类消费」长条图总览，不再列出每人消费总览
 * （每位成员的个别消费明细，改由「同行」页各自的成员卡片点击进入，不需要在这里重复呈现）
 */
function openCategoryStatsPage_() {
  renderCategorySummary();
  showSecondaryPage_('category-stats');
}

/**
 * 切换到「成员消费明细」二级页面，列出指定成员所有相关的纪录——用
 * showSecondaryPage_('member-detail')／closeSecondaryPage_() 这组通用
 * 二级页面机制，不透过 navigateToPage()，因为这不是底部导览
 * 五个分页之一，不需要更新 nav 高亮/header 标题那一整套逻辑
 * 包含：消费（他当付款人垫的 / 他有分摊到的），以及他自己付出去的还款纪录
 * （只记录「付给谁」，不记录「收到谁的」——那属于对方自己的还款纪录）
 * @param {string} name 成员姓名
 */
/**
 * 如果目前正显示著成员详情页，重新渲染一次内容——新增/编辑/删除私人消费後
 * 呼叫，不然要等使用者手动离开再进来一次才会看到最新状态。页面没开着的话
 * 什么都不做，不会平白多一次渲染
 */
function refreshMemberDetailPageIfOpen_() {
  const page = document.getElementById('page-member-detail');
  if (page && !page.classList.contains('is-hidden') && currentMemberDetailName) {
    openMemberDetailPage(currentMemberDetailName);
  }
}

function openMemberDetailPage(name) {
  currentMemberDetailName = name;
  const memberId = appState.memberIndex && appState.memberIndex.byName[name];

  const relatedExpenses = appState.expenses
    .filter((expense) => expense.PayerId === memberId || (expense.ParticipantIds || []).includes(memberId))
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));

  // 金库支出：钱已经由大家先打款进金库，视为「全员均摊」的个人消费，
  // 这里也要跟拆账消费合并显示，不然「同行」页面看到的个人消费会漏掉这一块
  // （PDF 报告、Hero Card 那边都已经是这样处理，这里补齐让三处一致）。
  // 金库户口的外币一律免换算：跟 PDF／Hero Card 用同一套「依币种分组」逻辑，
  // 不折算回基准货币、多币种时按币种并列显示（如「MYR 100.00 + CNY 50.00」）
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const poolShares = computeMemberPoolShares_(name);
  const poolDeductExpenses = poolShares.poolDeductExpenses;
  const poolConsumptionBreakdown = poolShares.consumptionBreakdown;

  const relatedRepayments = appState.repayments
    .filter((repayment) => repayment.FromMemberId === memberId)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));

  const stat = (appState.summary.balances || []).find((item) => item.name === name) ||
    { paid: 0, shouldPay: 0, repaid: 0 };
  const consumptionBreakdown = buildMixedCurrencyBreakdown(baseCurrency, stat.shouldPay, poolConsumptionBreakdown);
  const consumptionTotalText = formatCurrencyBreakdownText(consumptionBreakdown);

  const repaidNote = stat.repaid > AMOUNT_TOLERANCE ? t('memberDetail.repaidNote', { repaid: formatMoney(stat.repaid) }) : '';
  const totalCount = relatedExpenses.length + poolDeductExpenses.length + relatedRepayments.length;
  const status = getMemberStatusBadge(name);

  // 私人消费：只有查看自己时才有——RLS 已经保证 appState.personalExpenses 裡
  // 本来就只会有自己的资料，这裡的 isViewingSelf 判断是 UI 层再加一道保险，
  // 不是真正的隐私边界（真正的边界在阶段 7-1 的 RLS），避免「万一哪裡漏了
  // 权限检查」时不小心把这个分区露给查看别人时的画面
  const isViewingSelf = name === getViewerName();
  const personalExpensesForSelf = isViewingSelf
    ? appState.personalExpenses.slice().sort((a, b) => new Date(b.Date) - new Date(a.Date))
    : [];

  document.getElementById('memberExpenseTitle').textContent = `${name}${t('memberDetail.titleSuffix')}`;
  document.getElementById('memberExpenseSubtitle').textContent =
    t('memberDetail.summary', { count: totalCount, paid: formatMoney(stat.paid), shouldPay: consumptionTotalText }) + repaidNote + ' · ' + status.text;

  const listContainer = document.getElementById('memberExpenseList');

  if (totalCount === 0 && personalExpensesForSelf.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state empty-state-compact">
        <div class="empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none"><rect x="14" y="10" width="36" height="46" rx="6" stroke="currentColor" stroke-width="2"/><path d="M22 24H42M22 32H42M22 40H34" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3>${escapeHtml(t('memberDetail.empty.title'))}</h3>
        <p>${escapeHtml(t('memberDetail.empty.desc'))}</p>
      </div>
    `;
    const includePersonalRowEmpty = document.getElementById('includePersonalInReportRow');
    if (includePersonalRowEmpty) {
      includePersonalRowEmpty.classList.add('is-hidden');
    }
    showSecondaryPage_('member-detail');
    return;
  }

  let html = '';

  // ---- 区块一：消费明细（拆账消费 + 金库支出均摊份额，合并列出，最后接一个合计） ----
  if (relatedExpenses.length > 0 || poolDeductExpenses.length > 0) {
    html += `<p class="member-detail-section-label">${escapeHtml(t('memberDetail.expenseSectionLabel', { count: relatedExpenses.length + poolDeductExpenses.length }))}</p>`;
    html += relatedExpenses.map((expense) => renderMemberExpenseRow(expense, name, memberId)).join('');
    html += poolDeductExpenses.map((expense) => renderMemberPoolExpenseRow(expense, getPoolDeductShareAmount_(expense))).join('');
    html += `
      <div class="balance-row member-detail-total-row">
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(t('memberDetail.total'))}</p>
        </div>
        <p class="balance-amount mono">${escapeHtml(consumptionTotalText)}</p>
      </div>
    `;
  }

  // ---- 区块二：还款纪录（独立列出，最后接一个合计） ----
  if (relatedRepayments.length > 0) {
    const repaymentTotal = relatedRepayments.reduce((sum, item) => sum + Number(item.Amount || 0), 0);
    html += `<p class="member-detail-section-label member-detail-section-label-spaced">${escapeHtml(t('memberDetail.repaymentSectionLabel', { count: relatedRepayments.length }))}</p>`;
    html += relatedRepayments.map((repayment) => renderMemberRepaymentRow(repayment, name)).join('');
    html += `
      <div class="balance-row member-detail-total-row">
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(t('memberDetail.repaymentTotal'))}</p>
        </div>
        <p class="balance-amount mono">${escapeHtml(formatMoney(repaymentTotal, baseCurrency))}</p>
      </div>
    `;
  }

  // ---- 区块三：私人消费（跟群组无关，不参与分账/结算，只有自己看得到） ----
  if (personalExpensesForSelf.length > 0) {
    const personalBreakdown = groupAmountsByCurrency(personalExpensesForSelf, (item) => item.Amount, (item) => item.Currency);
    const personalTotalText = formatCurrencyBreakdownText(personalBreakdown);

    html += `<p class="member-detail-section-label member-detail-section-label-spaced">${escapeHtml(t('memberDetail.personalExpenseSectionLabel', { count: personalExpensesForSelf.length }))}</p>`;
    html += `<p class="form-hint">${escapeHtml(t('memberDetail.personalExpenseHint'))}</p>`;
    html += personalExpensesForSelf.map(renderPersonalExpenseRow_).join('');
    html += `
      <div class="balance-row member-detail-total-row">
        <div class="balance-info">
          <p class="balance-name">${escapeHtml(t('memberDetail.personalExpenseTotal'))}</p>
        </div>
        <p class="balance-amount mono">${escapeHtml(personalTotalText)}</p>
      </div>
    `;
  }

  listContainer.innerHTML = html;

  if (personalExpensesForSelf.length > 0) {
    bindPersonalExpenseRowActions_(listContainer);
  }

  // 汇出 PDF 那颗「包含我的私人消费」勾选框——只有查看自己、而且真的有私人消费
  // 可以附加时才显示，每次重新打开这个页面都重置回未勾选（预设不含）
  const includePersonalRow = document.getElementById('includePersonalInReportRow');
  const includePersonalCheckbox = document.getElementById('includePersonalInReportCheckbox');
  if (includePersonalRow) {
    includePersonalRow.classList.toggle('is-hidden', personalExpensesForSelf.length === 0);
  }
  if (includePersonalCheckbox) {
    includePersonalCheckbox.checked = false;
  }

  showSecondaryPage_('member-detail');
}

/**
 * 渲染「私人消费」分区裡的一列——跟一般消费的 renderMemberExpenseRow() 不同，
 * 私人消费没有「份额」「付款人」这些拆账概念，金额就是金额；编辑/删除直接放
 * 在列上，不像一般消费要点进「消费明细」Modal 才有——私人消费在整个 App 裡
 * 就只有这一个入口，不需要为它多包一层 Modal
 * @param {Object} expense
 * @return {string}
 */
function renderPersonalExpenseRow_(expense) {
  const iconMeta = getCategoryIconMeta(expense.Category);
  return `
    <div class="balance-row personal-expense-row" data-personal-expense-id="${escapeHtml(expense.ID)}">
      <div class="activity-icon ${iconMeta.cls}" aria-hidden="true">${iconMeta.svg}</div>
      <div class="balance-info">
        <p class="balance-name">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
        <p class="balance-sub">${escapeHtml(formatDateDisplay(expense.Date))} · ${escapeHtml(translateCategory(expense.Category))}</p>
      </div>
      <div class="personal-expense-row-end">
        <p class="balance-amount mono">${formatExpenseAmountDisplay(expense)}</p>
        <div class="personal-expense-row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-personal-expense-action="edit" data-i18n="aria.edit">编辑</button>
          <button type="button" class="btn btn-ghost btn-sm" data-personal-expense-action="delete" data-i18n="aria.delete">删除</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 绑定私人消费分区列上「编辑／删除」按钮的点击——直接重用一般消费编辑/删除
 * 那两支函式（openExpenseFormForEdit／handleDeleteExpenseClick 都已经改成
 * 会同时查 appState.expenses 跟 appState.personalExpenses），
 * 不需要另外写一套
 * @param {HTMLElement} container #memberExpenseList
 */
function bindPersonalExpenseRowActions_(container) {
  container.querySelectorAll('[data-personal-expense-action]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const row = btn.closest('[data-personal-expense-id]');
      const expenseId = row ? row.getAttribute('data-personal-expense-id') : null;
      if (!expenseId) return;

      const action = btn.getAttribute('data-personal-expense-action');
      if (action === 'edit') {
        openExpenseFormForEdit(expenseId);
      } else if (action === 'delete') {
        const expense = appState.personalExpenses.find((item) => item.ID === expenseId);
        handleDeleteExpenseClick(expenseId, expense ? (expense.Description || translateCategory(expense.Category)) : '');
      }
    });
  });
}

/**
 * 把「依货币分组的金额加总结果」格式化成文字，例如 "MYR 300.00 + USD 20.00"——
 * 多币种（尤其是金库免换算的场景）统一用这个格式并列呈现，取代直接加总不同货币的做法
 * @param {Array<{currency: string, total: number}>} breakdown
 * @return {string} 格式化后的文字
 */
function formatCurrencyBreakdownText(breakdown) {
  if (!breakdown || breakdown.length === 0) {
    return formatMoney(0);
  }
  return breakdown.map((item) => formatMoney(item.total, item.currency)).join(' + ');
}

/**
 * 渲染时间轴中的一笔「消费」列
 * @param {Object} expense 消费纪录物件
 * @param {string} name 目前正在查看的成员姓名（純顯示用，查詢份額金額）
 * @param {string} memberId 目前正在查看的成员 id（身份比对用）
 * @return {string} HTML 字串
 */
function renderMemberExpenseRow(expense, name, memberId) {
  const isPayer = expense.PayerId === memberId;
  const splitResult = calculateExpenseSplitClientSide(expense);
  const shareAmount = splitResult[name] !== undefined ? splitResult[name] : 0;

  const roleBadge = isPayer ? `<span class="badge badge-success">${t('badge.paid')}</span>` : '';

  return `
    <div class="balance-row">
      <div class="avatar">${escapeHtml(getInitials(expense.Payer))}</div>
      <div class="balance-info">
        <p class="balance-name">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
        <p class="balance-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))} · ${escapeHtml(translateCategory(expense.Category))}</p>
      </div>
      <div style="text-align:right;">
        <p class="balance-amount mono">${formatMoneyWithConversion(shareAmount, expense.Currency, expense.ExchangeRateSnapshot)}</p>
        ${roleBadge}
      </div>
    </div>
  `;
}

/**
 * 渲染「同行」页面个人消费明细里的一列金库支出——没有真人付款，均分给全体成员，
 * 头像用鸭子图示（getInitials 已经处理过 POOL_EXPENSE_PAYER_SENTINEL 的情况）
 * @param {Object} expense 消费纪录物件（SplitType='pool'）
 * @param {number} memberCount 目前旅程的成员人数，用来算均摊份额
 * @return {string} HTML 字串
 */
function renderMemberPoolExpenseRow(expense, shareAmount) {
  return `
    <div class="balance-row">
      <div class="avatar">${escapeHtml(getInitials(expense.Payer))}</div>
      <div class="balance-info">
        <p class="balance-name">${escapeHtml(expense.Description || translateCategory(expense.Category))}</p>
        <p class="balance-sub">${escapeHtml(t('expense.paidByDate', { payer: getExpensePayerDisplay(expense.Payer), date: formatDateDisplay(expense.Date) }))} · ${escapeHtml(translateCategory(expense.Category))}</p>
      </div>
      <div style="text-align:right;">
        <p class="balance-amount mono">${escapeHtml(formatMoney(shareAmount, expense.Currency))}</p>
      </div>
    </div>
  `;
}

/**
 * 渲染时间轴中的一笔「还款」列（包含部分还款）
 * @param {Object} repayment 还款纪录物件
 * @param {string} name 目前正在查看的成员姓名
 * @return {string} HTML 字串
 */
function renderMemberRepaymentRow(repayment, name) {
  const label = t('repayment.paidTo', { name: escapeHtml(repayment.ToMember) });
  const remarkNote = repayment.Remark ? ` · ${escapeHtml(repayment.Remark)}` : '';

  return `
    <div class="balance-row">
      <div class="avatar">${escapeHtml(getInitials(repayment.ToMember))}</div>
      <div class="balance-info">
        <p class="balance-name">${label}</p>
        <p class="balance-sub">${escapeHtml(formatDateDisplay(repayment.Date))} · ${escapeHtml(t('repayment.recordSuffix'))}${remarkNote}</p>
      </div>
      <div style="text-align:right;">
        <p class="balance-amount mono">${formatMoney(repayment.Amount)}</p>
        <span class="badge badge-warning">${t('badge.repay')}</span>
      </div>
    </div>
  `;
}

/**
 * 前端版的分账金额计算（仅用于消费明细 Modal 显示「这个人分摊了多少」，不影响 Backend 的真实结算）
 * 逻辑与 Backend 的 calculateEqualSplit / calculateCustomSplit 完全一致
 * @param {Object} expense 消费纪录物件
 * @return {Object} { name: shareAmount, ... }
 */
function calculateExpenseSplitClientSide(expense) {
  if (expense.SplitType === 'custom') {
    const result = {};
    Object.keys(expense.CustomSplit || {}).forEach((name) => {
      result[name] = Number(expense.CustomSplit[name]) || 0;
    });
    return result;
  }

  if (expense.SplitType === 'percentage') {
    const names = Object.keys(expense.CustomSplit || {});
    const result = {};
    let accumulated = 0;

    names.forEach((name, index) => {
      if (index < names.length - 1) {
        const share = Math.round((expense.Amount * (Number(expense.CustomSplit[name]) / 100)) * 100) / 100;
        result[name] = share;
        accumulated += share;
      } else {
        result[name] = Math.round((expense.Amount - accumulated) * 100) / 100;
      }
    });

    return result;
  }

  if (expense.SplitType === 'shares') {
    const names = Object.keys(expense.CustomSplit || {});
    const totalShares = names.reduce((sum, name) => sum + (Number(expense.CustomSplit[name]) || 0), 0);
    const result = {};

    if (totalShares <= 0) {
      names.forEach((name) => { result[name] = 0; });
      return result;
    }

    let accumulated = 0;
    names.forEach((name, index) => {
      if (index < names.length - 1) {
        const share = Math.round((expense.Amount * ((Number(expense.CustomSplit[name]) || 0) / totalShares)) * 100) / 100;
        result[name] = share;
        accumulated += share;
      } else {
        result[name] = Math.round((expense.Amount - accumulated) * 100) / 100;
      }
    });

    return result;
  }

  // 均分
  const participants = expense.Participants || [];
  if (participants.length === 0) {
    return {};
  }

  const baseShare = Math.round((expense.Amount / participants.length) * 100) / 100;
  const result = {};
  let accumulated = 0;

  participants.forEach((name, index) => {
    if (index < participants.length - 1) {
      result[name] = baseShare;
      accumulated += baseShare;
    } else {
      result[name] = Math.round((expense.Amount - accumulated) * 100) / 100;
    }
  });

  return result;
}


/* ------------------------------------------------------------
   14. 表单选项渲染（付款人 / 分类）
   ------------------------------------------------------------ */

function renderPayerSelectOptions() {
  const select = document.getElementById('expensePayer');
  const currentValue = select.value;
  select.innerHTML = `<option value="" disabled selected>${escapeHtml(t('expense.payerPlaceholder'))}</option>`;

  appState.members.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  if (appState.members.includes(currentValue)) {
    select.value = currentValue;
  }
}

/**
 * 设定「分类」栏位的值——统一透过这个函式，不要直接对 #expenseCategory 赋值，
 * 不然 pill 按钮的选中样式（.is-active）会跟实际的值不同步
 * @param {string} category
 */
function setExpenseCategoryValue_(category) {
  const hiddenInput = document.getElementById('expenseCategory');
  if (hiddenInput) hiddenInput.value = category || '';

  const container = document.getElementById('expenseCategoryPills');
  if (container) {
    container.querySelectorAll('.category-pill').forEach((pill) => {
      pill.classList.toggle('is-active', pill.getAttribute('data-category') === category);
    });
  }
}

/**
 * 渲染「分类」的快速选择 pill 按钮——用一整排可以直接点的圆角按钮取代下拉选单，
 * 选好之後金额通常也已经填了，分类是最後一个还没决定的东西，放在第一排最先看到、
 * 一点就选好，比还要点开下拉选单快很多
 */
function renderCategorySelectOptions() {
  const container = document.getElementById('expenseCategoryPills');
  const hiddenInput = document.getElementById('expenseCategory');
  const currentValue = hiddenInput ? hiddenInput.value : '';

  container.innerHTML = '';
  // 隐藏的自定义分类不出现在这里——「隐藏」的用意就是不想再拿它记新的消费，
  // 但历史上已经记过的消费还是正常显示（见 isCategoryInUse_() 那套删除保护）。
  // 例外：如果正在编辑的这笔消费本来用的就是一个後来被隐藏的分类，还是要
  // 保留那颗 pill，不然画面上会看起来像分类被清空了，使用者容易誤会
  const visibleCategories = appState.categories.filter(
    (category) => !category.isHidden || category.name === currentValue
  );
  visibleCategories.forEach((category) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'category-pill';
    pill.setAttribute('data-category', category.name);
    pill.innerHTML = (category.tripId ? '<span class="chip-custom-dot" aria-hidden="true"></span>' : '')
      + escapeHtml(translateCategory(category.name));
    container.appendChild(pill);
  });

  container.querySelectorAll('.category-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      setExpenseCategoryValue_(pill.getAttribute('data-category'));
    });
  });

  if (visibleCategories.some((category) => category.name === currentValue)) {
    setExpenseCategoryValue_(currentValue);
  }
}


/**
 * 渲染设置页「分类管理」面板的分类清单——系统内置分类只显示、不给任何操作
 * 按钮（RLS 本来就不允许一般使用者改内置分类，给了按钮点了也只会出错）；
 * 自定义分类带「改名／隐藏或取消隐藏／删除」三个动作。风格沿用设置页其他
 * 面板既有的 .settings-row + .btn-ghost.btn-sm 文字按钮，不新造一套列表
 * 元件或图示按钮的视觉语言。这份清单现在放在 categoryManageModal 裡，
 * 点设置页那行的「更改」才看得到，不是直接攤开在设置页上
 */
function renderCategoryManageList() {
  const container = document.getElementById('categoryManageList');
  if (!container) return;

  container.innerHTML = appState.categories.map((category) => {
    const iconMeta = getCategoryIconMeta(category.name);
    const isCustom = !!category.tripId;
    const dot = isCustom ? '<span class="chip-custom-dot" aria-hidden="true"></span>' : '';
    const hiddenBadge = category.isHidden
      ? `<span class="badge badge-warning">${escapeHtml(t('category.manage.hiddenBadge'))}</span>`
      : '';

    const actions = isCustom ? `
      <div class="category-manage-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-category-action="rename" data-category-id="${escapeHtml(category.id)}">${escapeHtml(t('category.manage.renameBtn'))}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-category-action="toggle-hide" data-category-id="${escapeHtml(category.id)}">${escapeHtml(category.isHidden ? t('category.manage.unhideBtn') : t('category.manage.hideBtn'))}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-category-action="delete" data-category-id="${escapeHtml(category.id)}">${escapeHtml(t('category.manage.deleteBtn'))}</button>
      </div>
    ` : '';

    return `
      <div class="settings-row category-manage-row">
        <div class="settings-row-text category-manage-row-text">
          <div class="activity-icon ${iconMeta.cls}" aria-hidden="true">${iconMeta.svg}</div>
          <p class="settings-row-title">${dot}${escapeHtml(translateCategory(category.name))} ${hiddenBadge}</p>
        </div>
        ${actions}
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-category-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const categoryId = btn.getAttribute('data-category-id');
      const category = appState.categories.find((item) => item.id === categoryId);
      if (!category) return;

      const action = btn.getAttribute('data-category-action');
      if (action === 'rename') {
        openCategoryFormModal_(category);
      } else if (action === 'toggle-hide') {
        handleToggleCategoryHiddenClick(category);
      } else if (action === 'delete') {
        handleDeleteCategoryClick(category);
      }
    });
  });

  renderCategoryManagePreview_();
}

/**
 * 设置页「分类管理」面板的摘要：把目前所有分类打横排成一排 chip（不给点击、
 * 不带操作按钮），让使用者不用点进二级页面就能一眼看到「现在有哪些分类」。
 * 隐藏的分类不出现在这裡——预览要反映的是「记账表单实际选得到的分类」，
 * 跟 renderCategorySelectOptions() 的过滤逻辑一致，不是「分类管理」二级页面
 * 那种连隐藏的都要看到、才好选回来取消隐藏的完整清单。真正的改名/隐藏/
 * 删除/新增都收在 page-category-manage 里，点设置页这颗「更改」才切过去
 * （见 openCategoryManagePage_()）
 */
function renderCategoryManagePreview_() {
  const container = document.getElementById('categoryPreviewChips');
  if (!container) return;

  container.innerHTML = (appState.categories || [])
    .filter((category) => !category.isHidden)
    .map((category) => {
      const dot = category.tripId ? '<span class="chip-custom-dot" aria-hidden="true"></span>' : '';
      return `<span class="chip category-preview-chip">${dot}${escapeHtml(translateCategory(category.name))}</span>`;
    })
    .join('');
}

/**
 * 设置页「分类管理」摘要的「更改」按钮：切到 page-category-manage 二级页面
 */
function openCategoryManagePage_() {
  renderCategoryManageList();
  showSecondaryPage_('category-manage');
}

/**
 * 打开新增/编辑分类用的 Modal——不传 category 就是新增，传了就是编辑
 * （沿用 renameTripModal 那套「同一个 Modal，靠 dataset 有没有存目标 id
 * 分辨新增/编辑」的模式，见 handleRenameTripFormSubmit()）
 * @param {Object} [category]
 */
function openCategoryFormModal_(category) {
  const modalEl = document.getElementById('page-add-category');
  const nameInput = document.getElementById('categoryNameInput');
  const titleEl = document.getElementById('addCategoryModalTitle');

  modalEl.dataset.targetCategoryId = category ? category.id : '';
  nameInput.value = category ? category.name : '';
  titleEl.textContent = category ? t('addCategoryModal.editTitle') : t('addCategoryModal.title');

  renderCategoryIconPicker_(category ? category.icon : null);
  openModal('addCategoryModal');
}

/**
 * 渲染新增/编辑分类 Modal 里的图示选择格——用 CUSTOM_CATEGORY_ICON_PRESETS
 * 这组自定义分类专属的预设图示（阶段 9 後修正：原本沿用系统内置分类的
 * 6 组图示，会造成自定义分类跟内置分类长得一模一样，见 CUSTOM_CATEGORY_ICON_PRESETS
 * 的说明），点选後存的是 key（例如 'Camera'），不是重新画一次 SVG；不选
 * 任何一个也能储存，届时显示会自动退回分类名首字的色块兜底
 * @param {string|null} selectedIcon
 */
function renderCategoryIconPicker_(selectedIcon) {
  const container = document.getElementById('categoryIconPicker');
  if (!container) return;

  container.innerHTML = Object.keys(CUSTOM_CATEGORY_ICON_PRESETS).map((key) => {
    const meta = CUSTOM_CATEGORY_ICON_PRESETS[key];
    const isActive = key === selectedIcon;
    return `
      <button type="button" class="category-icon-option activity-icon ${meta.cls}${isActive ? ' is-active' : ''}" data-icon-key="${escapeHtml(key)}" aria-label="${escapeHtml(t('categoryIcon.' + key))}">
        ${meta.svg}
      </button>
    `;
  }).join('');

  container.querySelectorAll('.category-icon-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const alreadyActive = btn.classList.contains('is-active');
      container.querySelectorAll('.category-icon-option').forEach((b) => b.classList.remove('is-active'));
      // 再点一次同一个图示可以取消选取，退回「首字色块」兜底——不是每个
      // 自定义分类都一定要有图示，给使用者反悔的空间
      if (!alreadyActive) {
        btn.classList.add('is-active');
      }
    });
  });
}

/**
 * 绑定设置页「分类管理」面板的「新增分类」按钮跟表单送出事件
 */
function initCategoryManage() {
  const addBtn = document.getElementById('addCategoryBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openCategoryFormModal_());
  }

  const form = document.getElementById('categoryForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleCategoryFormSubmit_();
    });
  }

  const openManageBtn = document.getElementById('openCategoryManageBtn');
  if (openManageBtn) {
    openManageBtn.addEventListener('click', openCategoryManagePage_);
  }
}

/**
 * 依分账方式回传要显示的徽章样式 class 与文字，四种模式各自有专属颜色
 * @param {string} splitType 'equal' | 'custom' | 'percentage' | 'shares'
 * @return {{className: string, label: string}}
 */
function getSplitTypeBadgeInfo(splitType) {
  switch (splitType) {
    case 'custom':
      return { className: 'badge-warning', label: t('badge.custom') };
    case 'percentage':
      return { className: 'badge-accent', label: t('split.percentage') };
    case 'shares':
      return { className: 'badge-info', label: t('split.shares') };
    case 'pool':
      // 金库支出／代垫归还不拆账给任何人，之前落到 default 分支会被误标成「均分」，
      // 明确给一个自己的标签，账目页跟 PDF 报告的拆账栏位才不会显示错误资讯
      return { className: 'badge-info', label: t('pool.report.poolSplitBadge') };
    default:
      return { className: 'badge-success', label: t('badge.equal') };
  }
}

/**
 * 分类文字显示的唯一出口——不管是筛选 chip、记账表单 pill、消费列表、PDF 报告，
 * 全部都要走这支函式，不要各自 inline 组字串。
 * formatCategoryType() 那种「大类 · 子类」的複合格式，也是在这支函式的结果上
 * 再包一层，不是另开一条自己的翻译路径。
 *
 * 系统内置分类（'Food'/'Transport'/…）继续走 STRINGS 的 category.* key；
 * 自定义分类不翻译，两种语言下都显示使用者输入的原文——这是刻意的产品决定
 * （使用者自己起的名字不是系统术语，强制填双语只会让
 * 一半用户漏填，自动翻译又不可控）。这里不用另外判断「这是不是自定义分类」，
 * 单纯利用「自定义分类的名字在 STRINGS 里必然查不到对应 key」这件事自然
 * 达到「查得到就翻译、查不到就show原文」的效果——前提是新增分类时不能让
 * 使用者把自定义分类取成跟内置分类一模一样的名字，这层验证在
 * handleCategoryFormSubmit_() 里做
 * @param {string} category 分类原始值（例如 'Hotel' 或使用者自订的 '潜水装备'）
 * @return {string}
 */
function translateCategory(category) {
  const key = `category.${category}`;
  const translated = STRINGS[currentLang] && STRINGS[currentLang][key];
  return translated || category || '';
}

/**
 * 把类别格式化成「大类 · 子类别」的统一格式（例如「消费 · 住宿」），
 * 用于 PDF 报告「消费明细」表格的「类型」欄位——跟支付明细／收款明细的「类型」欄位
 * （代付／金库预付／还款…）并排呈现时，样式与语意才一致
 * @param {string} category 类别代码（例如 'Hotel'）
 * @return {string} 格式化后的文字，例如「消费 · 住宿」
 */
function formatCategoryType(category) {
  return `${t('personalReport.typeExpense')} · ${translateCategory(category)}`;
}


/* ------------------------------------------------------------
   15. 主题切换（深色模式）
   ------------------------------------------------------------ */

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

  // 桌面侧栏、手机抽屉都有各自的深色模式切换按钮，靠共用的 [data-theme-toggle-btn]
  // 属性一次全部绑定，之后不管加了几个入口都不用改这支函式
  document.querySelectorAll('[data-theme-toggle-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY_THEME, theme);

  const darkModeSwitch = document.getElementById('darkModeSwitch');
  if (darkModeSwitch) {
    darkModeSwitch.checked = theme === 'dark';
  }

  updateThemeToggleLabel(theme);
}

/**
 * 更新侧栏「深色模式」切换按钮的文字：显示的是「点了会切到哪个模式」，
 * 跟语言切换按钮同一套逻辑（选了 English 后按钮显示「中文」，不是显示目前是哪个）——
 * 目前是深色就显示「浅色模式」，目前是浅色就显示「深色模式」
 * @param {string} theme 目前的主题：'dark' 或 'light'
 */
function updateThemeToggleLabel(theme) {
  const label = document.getElementById('themeToggleLabel');
  if (label) {
    label.textContent = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  }

  // 手机抽屉那颗深色模式按钮是独立的元素，文字要跟着同步更新
  const drawerLabel = document.getElementById('drawerThemeToggleLabel');
  if (drawerLabel) {
    drawerLabel.textContent = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  }
}


/* ------------------------------------------------------------
   16. Settings 页专属互动
   ------------------------------------------------------------ */

function initSettingsPage() {
  document.getElementById('darkModeSwitch').addEventListener('change', (event) => {
    applyTheme(event.target.checked ? 'dark' : 'light');
  });

  const openPoolManageBtn = document.getElementById('openPoolManageBtn');
  if (openPoolManageBtn) {
    openPoolManageBtn.addEventListener('click', openPoolManagePage_);
  }
}

/**
 * 设置页「搭伙鸭金库」摘要的按钮：切到 page-pool-manage 二级页面（还没开启、
 * 已开启可管理、已开启唯读三种状态都在同一个二级页面里，见 renderPoolSettingsPanel()）
 */
function openPoolManagePage_() {
  showSecondaryPage_('pool-manage');
}


/* ------------------------------------------------------------
   16A2. 货币与汇率设置
   ------------------------------------------------------------ */

// 支援的货币代码清单（消费币别、旅程基准货币、设置页基准货币，三处共用同一份清单）
const SUPPORTED_CURRENCIES = [
  'MYR', 'SGD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'TWD',
  'THB', 'VND', 'IDR', 'PHP', 'KRW', 'INR', 'AUD', 'NZD', 'CAD',
  'CHF', 'AED', 'SAR'
];

/**
 * 把完整货币清单填入指定的 <select>，可选择预设选取哪个货币
 * @param {string} selectId select 元素的 DOM id
 * @param {string} [selectedValue] 预设选取的货币代码
 */
function renderCurrencySelectOptions(selectId, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return; // 找不到这个下拉选单就安全跳过，不要让整个启动流程被一个不存在的元素卡死

  select.innerHTML = SUPPORTED_CURRENCIES.map((code) => `<option value="${code}">${code}</option>`).join('');

  if (selectedValue && SUPPORTED_CURRENCIES.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

/**
 * 绑定设置页「货币与汇率」面板的储存按钮、抓取即时汇率按钮，与基准货币下拉选单的初始选项
 */
function initCurrencySettings() {
  renderCurrencySelectOptions('baseCurrencySelect');
  renderCurrencySelectOptions('tripBaseCurrency');
  renderCurrencySelectOptions('expenseCurrency');
  renderCurrencySelectOptions('poolCurrencySelect');

  document.getElementById('saveCurrencyBtn').addEventListener('click', handleSaveCurrencySettings);
  document.getElementById('fetchAllRatesBtn').addEventListener('click', handleFetchAllLiveRates);

  const openBtn = document.getElementById('openCurrencySettingsBtn');
  if (openBtn) {
    openBtn.addEventListener('click', openCurrencySettingsPage_);
  }
}

/**
 * 设置页「财务设置」摘要的「更改」按钮：切到 page-currency-settings 二级页面
 */
function openCurrencySettingsPage_() {
  showSecondaryPage_('currency-settings');
}

/**
 * 取得目前旅程中，实际用到但「还没设定汇率」的货币清单
 * 用于新增消费后的即时警示，以及记录还款前的主动拦截
 * @return {Array<string>} 货币代码阵列，例如 ['USD', 'TWD']
 */
function getMissingExchangeRateCurrencies() {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const usedCurrencies = [...new Set(appState.expenses.map((expense) => expense.Currency || baseCurrency))]
    .filter((currency) => currency !== baseCurrency);

  return usedCurrencies.filter((currency) => appState.tripCurrency.rates[currency] === undefined);
}

// 汇率多久算「过期」：超过这个时间就会在下次记消费时自动重新抓一次，而不是永远沿用
// 第一次抓到的旧汇率——旅程拉长到好几天，汇率本身也会波动，不重新抓的话只会越来越不准
const EXCHANGE_RATE_STALE_MS = 12 * 60 * 60 * 1000; // 12 小时

/**
 * 判断某个货币目前存的汇率是不是「过期」了（超过 24 小时没更新）
 * 只有「本来就有设定汇率」才谈得上过期；完全没设定过是另一种情况（见 rateIsMissing），
 * 这个函式不处理那种情况，一律回传 false（交给「找不到汇率」那条路去处理，逻辑不重叠）
 * @param {string} currency 货币代码
 * @return {boolean} 是否已经过期
 */
function isExchangeRateStale(currency) {
  const updatedAt = appState.tripCurrency.updatedAt && appState.tripCurrency.updatedAt[currency];
  if (!updatedAt) {
    return false;
  }

  const updatedTime = new Date(updatedAt).getTime();
  if (isNaN(updatedTime)) {
    return false;
  }

  return (Date.now() - updatedTime) > EXCHANGE_RATE_STALE_MS;
}

/**
 * 渲染「货币与汇率」面板：设定目前的基准货币，并为旅程中实际用到、
 * 但不是基准货币的每一种货币，各自渲染一个汇率输入框
 */
function renderCurrencySettings() {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';

  document.getElementById('baseCurrencySelect').value = baseCurrency;

  // 找出这个旅程实际用到的所有货币（排除基准货币本身）
  const usedCurrencies = [...new Set(appState.expenses.map((expense) => expense.Currency || baseCurrency))]
    .filter((currency) => currency !== baseCurrency)
    .sort();

  const fieldsContainer = document.getElementById('exchangeRateFields');

  if (usedCurrencies.length === 0) {
    fieldsContainer.innerHTML = `<p class="form-hint">${escapeHtml(t('currency.allBaseCurrency'))}</p>`;
  } else {
    fieldsContainer.innerHTML = usedCurrencies.map((currency) => {
      const savedRate = appState.tripCurrency.rates[currency];
      const rateValue = savedRate !== undefined ? savedRate : '';
      return `
        <div class="exchange-rate-row">
          <span class="exchange-rate-row-label">1 ${escapeHtml(currency)} =</span>
          <input type="number" class="text-input exchange-rate-input" data-currency="${escapeHtml(currency)}" placeholder="0.0000" min="0" step="0.0001" value="${rateValue}">
          <span class="exchange-rate-row-label">${escapeHtml(baseCurrency)}</span>
          <button class="rate-fetch-btn" type="button" data-fetch-rate-for="${escapeHtml(currency)}" aria-label="${escapeHtml(t('currency.fetchRateAria'))}" title="${escapeHtml(t('currency.fetchRateAria'))}">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 12C4 7.6 7.6 4 12 4C15 4 17.6 5.7 19 8.2M20 12C20 16.4 16.4 20 12 20C9 20 6.4 18.3 5 15.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 4V8.2H14.8M5 20V15.8H9.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      `;
    }).join('');

    fieldsContainer.querySelectorAll('[data-fetch-rate-for]').forEach((button) => {
      button.addEventListener('click', async () => {
        const success = await handleFetchLiveRate(button.getAttribute('data-fetch-rate-for'), baseCurrency, button);
        if (success) {
          renderCurrencySettings();
        }
      });
    });
  }

  // 提示目前有哪些货币还没设定汇率（结算时暂时会以 1:1 计算，容易算错）
  const missingCurrencies = usedCurrencies.filter((currency) => appState.tripCurrency.rates[currency] === undefined);
  const warningEl = document.getElementById('exchangeRateWarning');

  if (missingCurrencies.length > 0) {
    warningEl.classList.remove('is-hidden');
    warningEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 9V13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1" fill="currentColor"/><path d="M10.3 4.5C11.1 3.2 12.9 3.2 13.7 4.5L20.6 16.5C21.4 17.9 20.4 19.6 18.8 19.6H5.2C3.6 19.6 2.6 17.9 3.4 16.5L10.3 4.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
      <span>${escapeHtml(missingCurrencies.join('、'))}：${escapeHtml(t('currency.missingWarning'))}</span>
    `;
  } else {
    warningEl.classList.add('is-hidden');
    warningEl.innerHTML = '';
  }

  // 同步更新还款表单上的货币提示
  const repaymentHint = document.getElementById('repaymentCurrencyHint');
  if (repaymentHint) {
    repaymentHint.textContent = t('repayment.currencyUnitHint', { currency: baseCurrency });
  }

  // 设置页「财务设置」摘要：标题／说明都是固定文字（写在 index.html），
  // 这裡只负责补上第三行「现在的值」——汇率设定得完不完整的细节，
  // 留给点进二级页面後的 exchangeRateWarning 讲，摘要只讲「现在用哪个货币」
  const summaryEl = document.getElementById('financialSettingsSummary');
  if (summaryEl) {
    summaryEl.textContent = baseCurrency;
  }
}

/**
 * 抓取单一货币的即时汇率（呼叫 Backend 的 Wise 汇率代理），成功后直接存进这趟旅程的
 * 汇率设定——不用使用者自己再按一次「储存货币设定」，抓到就是存到了
 * @param {string} currency 要查询的货币代码
 * @param {string} baseCurrency 旅程的基准货币
 * @param {HTMLElement} button 触发的按钮（用来显示 loading 状态）
 * @return {Promise<boolean>} 是否成功
 */
async function handleFetchLiveRate(currency, baseCurrency, button) {
  if (button) {
    button.classList.add('is-loading');
    button.disabled = true;
  }

  try {
    const result = await fetchLiveRate_(currency, baseCurrency);
    await saveExchangeRates_({ rates: { [currency]: result.rate } });
    appState.tripCurrency.rates[currency] = result.rate;
    appState.tripCurrency.updatedAt[currency] = new Date().toISOString();

    const input = document.querySelector(`.exchange-rate-input[data-currency="${CSS.escape(currency)}"]`);
    if (input) {
      input.value = result.rate;
    }

    showToast('success', t('toast.rateAutoFetched'), t('toast.rateAutoFetchedMsg', { currency, rate: result.rate, base: baseCurrency }));
    return true;
  } catch (error) {
    showToast('error', t('toast.rateFetchFailed'), error.message);
    return false;
  } finally {
    if (button) {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  }
}

/**
 * 「抓取全部即时汇率」按钮：依序抓取目前旅程用到、但不是基准货币的每一种货币
 */
async function handleFetchAllLiveRates() {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const usedCurrencies = [...new Set(appState.expenses.map((expense) => expense.Currency || baseCurrency))]
    .filter((currency) => currency !== baseCurrency);

  if (usedCurrencies.length === 0) {
    showToast('info', t('toast.noCurrenciesToFetch'), t('toast.noCurrenciesToFetchMsg'));
    return;
  }

  const button = document.getElementById('fetchAllRatesBtn');
  setButtonLoading(button, true);

  let successCount = 0;

  // 依序（非并行）呼叫，避免短时间内对 Wise 端点发出过多平行请求
  for (const currency of usedCurrencies) {
    const fetchButton = document.querySelector(`[data-fetch-rate-for="${CSS.escape(currency)}"]`);
    const success = await handleFetchLiveRate(currency, baseCurrency, fetchButton);
    if (success) {
      successCount += 1;
    }
  }

  setButtonLoading(button, false);

  if (successCount > 0) {
    showToast('success', t('toast.allRatesFetched'), t('toast.allRatesFetchedMsg', { count: successCount }));
    renderCurrencySettings();
  }
}


/**
 * 处理「储存货币设定」按钮点击：送出基准货币与所有汇率输入框的数值
 */
async function handleSaveCurrencySettings() {
  const baseCurrency = document.getElementById('baseCurrencySelect').value;
  const rateInputs = document.querySelectorAll('.exchange-rate-input');

  const ratesObject = {};
  let hasInvalidRate = false;

  rateInputs.forEach((input) => {
    const currency = input.getAttribute('data-currency');
    const value = input.value.trim();

    if (value === '') {
      return; // 允许留空，代表这次先不设定这个货币的汇率
    }

    const rateValue = parseFloat(value);
    if (isNaN(rateValue) || rateValue <= 0) {
      hasInvalidRate = true;
      return;
    }

    ratesObject[currency] = rateValue;
  });

  if (hasInvalidRate) {
    showToast('error', t('toast.exchangeRateFormatError'), t('toast.exchangeRateFormatErrorMsg'));
    return;
  }

  const submitBtn = document.getElementById('saveCurrencyBtn');
  setButtonLoading(submitBtn, true);

  try {
    await saveExchangeRates_({ baseCurrency, rates: ratesObject });

    // 基准货币或汇率改变，会影响所有跟结算相关的数字，整趟旅程资料重新载入一次最保险
    await loadTripData();
  } catch (error) {
    showToast('error', t('toast.saveFailed'), error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}


/* ------------------------------------------------------------
   16B. 危险区域：删除目前旅程（建立者）／ 退出旅程（用邀请码加入的人）
   ------------------------------------------------------------ */

/**
 * 绑定设置页危险区域按钮：依 appState.canDeleteTrip 分流成「删除目前旅程」（建立者，
 * 会连带清光所有人的资料）或「退出旅程」（邀请码加入的人，只影响自己）。
 * 按钮只绑一次事件，每次点击当下才判断现在这趟旅程有没有删除权限——这样切换旅程
 * 之後不用重新绑事件，按钮上显示的文字则交给 renderDangerZoneButton() 同步
 */
function initDangerZone() {
  document.getElementById('deleteTripBtn').addEventListener('click', () => {
    if (!currentTripId) {
      showToast('error', t('toast.noTripSelected'), '');
      return;
    }

    if (appState.canDeleteTrip) {
      handleDeleteTripClick();
    } else {
      handleLeaveTripClick();
    }
  });
}

/**
 * 删除整趟旅程——只有建立者会走到这条路径（按钮本身已经依权限分流，後端 handleDeleteTrip
 * 也会再检查一次，双重保险），会连带清光所有人的成员/消费/还款纪录
 */
function handleDeleteTripClick() {
  const tripName = getTripName(currentTripId);

  openConfirmModal(
    t('confirm.deleteTrip', { name: tripName }),
    async () => {
      // RLS 的「delete own trips」规则已经限制只有建立者能删这一列，就算前端判断有误，
      // 数据库那边还是会挡下来——这里删除 trips 那一列之後，members/expenses/repayments/
      // exchange_rates 会因为建表时设定的 on delete cascade 自动跟着清光
      const { error } = await supabaseClient.from('trips').delete().eq('id', currentTripId);
      if (error) throw error;
      showToast('success', t('toast.tripDeleted'), t('toast.tripDeletedMsg', { name: tripName }));
      localStorage.removeItem(STORAGE_KEY_CURRENT_TRIP);
      await bootstrapApp();
      // bootstrapApp() 不会主动切页，画面还是留在设置页——但如果使用者删除前
      // 页面已经往下捲到「危险区域」按钮那边，捲动位置不会跟着重置，会让人
      // 誤以为删除没生效、忍不住又按一次。这里主动切回设置页顶端给个明确回饋
      navigateToPage('settings');
    }
  );
}

/**
 * 退出旅程——用邀请码加入的人走这条路径，只影响自己：这个账号之後不会再看到这趟旅程，
 * 但先前记的消费、其他人的资料都还会保留，之後也可以再用邀请码加入回来
 */
function handleLeaveTripClick() {
  const tripName = getTripName(currentTripId);

  openConfirmModal(
    t('confirm.leaveTrip', { name: tripName }),
    async () => {
      const session = getUserSession();
      // 只清空自己那一列 members 的 user_id，不是整列删掉——历史纪录都还留着，
      // 之後其他人看到的消费/还款还是完整的
      const { error } = await supabaseClient
        .from('members')
        .update({ user_id: null })
        .eq('trip_id', currentTripId)
        .eq('user_id', session ? session.userId : '');
      if (error) throw error;
      showToast('success', t('toast.tripLeft'), t('toast.tripLeftMsg', { name: tripName }));
      localStorage.removeItem(STORAGE_KEY_CURRENT_TRIP);
      await bootstrapApp();
    },
    {
      title: t('confirm.leaveTripTitle'),
      confirmLabel: t('confirm.leaveTripLabel')
      // danger 维持预设 true：退出後会立刻失去这趟旅程的存取权，风险层级跟删除相近
    }
  );
}

/**
 * 依 appState.canDeleteTrip 同步设置页危险区域按钮显示的文字——每次载入/切换旅程都要呼叫，
 * 同一个账号在不同旅程里的身分可能不一样（这趟是建立者，那趟只是被邀请加入的）
 */
function renderDangerZoneButton() {
  const button = document.getElementById('deleteTripBtn');
  if (!button) {
    return;
  }

  const key = appState.canDeleteTrip ? 'settings.deleteTrip' : 'settings.leaveTrip';
  button.setAttribute('data-i18n', key);
  button.textContent = t(key);
}

/**
 * 设置页「即将清理的旧旅程」区块——呼叫 get_my_expiring_trips() 这支 RPC
 * （跟後端 cleanup_stale_trips() 用同一套 365 天/最后活动时间算法），
 * 列出使用者名下 30 天内会被自动清掉的旅程，让他有机会先自己导出备份。
 * 一个都没有就把整个面板藏起来，不占版面。
 * 只在登入後跑一次（见 startAppAfterAuth()），不随旅程切换重新整理——
 * 这是跨旅程/账号层级的资讯，不属于「目前这趟旅程」的状态
 */
async function renderExpiringTripsPanel_() {
  const panel = document.getElementById('expiringTripsPanel');
  if (!panel) return;

  try {
    const { data, error } = await supabaseClient.rpc('get_my_expiring_trips', { _within_days: 30 });
    if (error) throw error;

    const trips = data || [];
    if (trips.length === 0) {
      panel.classList.add('is-hidden');
      return;
    }

    document.getElementById('expiringTripsSubtitle').textContent =
      t('settings.expiringTrips.subtitle', { count: trips.length });

    const listEl = document.getElementById('expiringTripsList');
    listEl.innerHTML = trips.map((trip) => `
      <div class="expiring-trip-row">
        <div class="expiring-trip-row-text">
          <p class="expiring-trip-row-name">${escapeHtml(trip.trip_name)}</p>
          <p class="expiring-trip-row-days">${escapeHtml(t('settings.expiringTrips.daysLeft', { days: trip.days_remaining }))}</p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-expiring-trip-id="${escapeHtml(trip.trip_id)}">${escapeHtml(t('settings.expiringTrips.viewBtn'))}</button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-expiring-trip-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tripId = btn.getAttribute('data-expiring-trip-id');
        await switchCurrentTrip(tripId);
        goToPage_('summary');
      });
    });

    panel.classList.remove('is-hidden');
  } catch (error) {
    // 静默失败：这只是一个提醒性质的区块，读不到就不显示，不要因为这个
    // 次要功能的错误跳出 Toast 打断使用者，也不影响设置页其他部分正常使用
    console.error('renderExpiringTripsPanel_ 失败：', error);
    panel.classList.add('is-hidden');
  }
}

/**
 * 把目前旅程的邀请码显示在设置页的邀请卡片上（邀请码就是旅程自己的 ID，
 * 见 appState.inviteCode，由 getTripBootstrap 回传）
 * 容错：还没选旅程／容器不存在时安全跳过，不清空既有内容
 */
function renderInviteCard() {
  const codeEl = document.getElementById('inviteCodeText');
  if (!codeEl) return;

  codeEl.textContent = appState.inviteCode || '—';
}

/**
 * 绑定设置页邀请卡片的「分享」按钮——组一段带连结的
 * 分享文字（跟提醒讯息那个连结同一套：?invite=邀请码，对方点了会自动帮他切到
 * 注册分页、邀请码也预填好）。装置支援原生分享面板（navigator.share）就跳出来，
 * 不支援的环境（多半是桌面浏览器）退回复制到剪贴板，让使用者自己贴去想发的地方
 */
function initInviteCard() {
  const button = document.getElementById('copyInviteCodeBtn');
  if (!button) return;

  button.addEventListener('click', async () => {
    const code = appState.inviteCode || document.getElementById('inviteCodeText').textContent;
    if (!code || code === '—') return;

    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;
    const tripName = getTripName(currentTripId) || t('report.untitledTrip');
    const message = t('invite.shareMessage', { tripName, link: inviteLink });

    try {
      if (navigator.share) {
        await navigator.share({ text: message });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast('success', t('invite.copiedTitle'), t('invite.copiedMsg'));
    } catch (error) {
      if (error && error.name === 'AbortError') return; // 使用者自己在分享面板按了取消，不是错误
      showToast('error', t('invite.copiedTitle'), '');
    }
  });
}

/* ------------------------------------------------------------
   16C. 汇出 PDF 报告
   ------------------------------------------------------------ */

/**
 * 把字串处理成适合当档名的形式：去除档名系统不允许的符号，并把前后空白清掉
 * @param {string} str 原始字串
 * @return {string} 清理后的字串
 */
/**
 * 把字串处理成适合当档名的形式：去除档名系统不允许的符号，并把前后空白清掉。
 * 另外限制长度——旅程名称/成员姓名是使用者自订的，可能很长，不处理的话
 * 交给操作系统的档名长度上限去硬切，容易切在一半还带着乱码尾巴；
 * 这里统一在 80 字元处收尾并加省略号，行为可预期。
 * @param {string} str 原始字串
 * @return {string} 清理后的字串
 */
function sanitizeForFilename(str) {
  const cleaned = String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
  const MAX_LEN = 80;
  return cleaned.length > MAX_LEN ? `${cleaned.slice(0, MAX_LEN).trim()}…` : cleaned;
}

/**
 * 呼叫浏览器原生列印功能前，先把 document.title 换成想要的档名，
 * 因为浏览器「另存为 PDF」预设会拿网页标题当档名；列印结束后再把标题还原，
 * 避免影响页面上其他显示网页标题的地方
 * @param {string} filenameTitle 想要当作 PDF 档名的标题
 */
function printWithFilename(filenameTitle) {
  const originalTitle = document.title;
  document.title = filenameTitle || originalTitle;

  const restoreTitle = () => {
    document.title = originalTitle;
    window.removeEventListener('afterprint', restoreTitle);
  };
  window.addEventListener('afterprint', restoreTitle);

  window.print();

  // 保险起见：部分浏览器不一定会触发 afterprint，稍后强制还原一次
  setTimeout(restoreTitle, 2000);
}

/**
 * 绑定「汇出 PDF」按钮：产生报告内容，并呼叫浏览器原生列印功能
 * 使用者在列印对话框中选择「储存为 PDF」即可产生 PDF 档案，
 * 不需要任何第三方函式库或伺服器端服务
 */
let printQualityHintShown_ = false;

/**
 * 汇出用的是浏览器原生 window.print()，不是真正的 PDF 绘制引擎——多数浏览器
 * 预设会关闭「背景图形」，卡片底色/投影/强调色底纹届时会直接消失，跟 App 里
 * 看到的观感落差很大。这里在每次会话第一次汇出时提醒一次，成本最低、
 * 能立即改善大多数使用者的实际输出品质。
 */
function maybeShowPrintQualityHint_() {
  if (printQualityHintShown_) return;
  printQualityHintShown_ = true;
  showToast('info', t('report.printQualityHintTitle'), t('report.printQualityHintMsg'));
}

/**
 * 等 #printReport 裡的图片（目前就报表表头那颗 logo）都真的加载完成，
 * 才让呼叫端接着叫 window.print()。不等的话，innerHTML 塞进 <image> 後
 * 图片才刚开始送出网路请求，浏览器的打印/汇出 PDF 引擎就已经把画面「拍」
 * 下来了，logo 那块会是空的——网速快、图片有快取的时候刚好来得及加载完
 * 才正常显示，这正是「有时候有 logo、有时候没有」的真正原因，不是 App
 * 本身时好时坏，是没等图片就动手拍照
 * @return {Promise<void>}
 */
function waitForReportImagesToLoad_() {
  const container = document.getElementById('printReport');
  const images = container ? Array.from(container.querySelectorAll('image, img')) : [];
  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(images.map((img) => new Promise((resolve) => {
    // HTML <img> 有 .complete／.naturalWidth 可以直接判断是不是已经加载好
    // （例如上一次汇出已经加载过、浏览器快取還热著）；SVG <image> 没有这组
    // 属性，一律乖乖等 load/error 事件
    const isHtmlImg = img.tagName === 'IMG';
    if (isHtmlImg && img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    img.addEventListener('load', done, { once: true });
    // 加载失败也不能让整个汇出流程卡住——放行让打印照常继续，
    // 只是那张图片届时会是空的，总比按了汇出完全没反应好
    img.addEventListener('error', done, { once: true });
    // 保险：万一某些浏览器在图片已经在快取里时不补发 load 事件，
    // 最多等 2 秒强制放行，不要让使用者点了汇出一直卡住没反应
    setTimeout(done, 2000);
  })));
}

/**
 * 结算页「汇出 PDF」的实际动作——拆成独立具名函式，桌面版的 exportPdfBtn
 * 跟手机版 FAB（结算页时）现在都会呼叫到同一份逻辑，不用各自维护一份
 */
async function exportSummaryPdf() {
  if (!currentTripId || appState.expenses.length === 0) {
    showToast('error', t('toast.noDataToExport'), t('toast.noDataToExportMsg'));
    return;
  }

  await autoFetchMissingRatesForExport();

  document.getElementById('printReport').innerHTML = buildPrintReportHtml();
  await waitForReportImagesToLoad_();

  const tripName = getTripName(currentTripId) || t('report.untitledTrip');
  maybeShowPrintQualityHint_();
  printWithFilename(`${sanitizeForFilename(tripName)} Expenses Report`);
}

function initPdfExport() {
  document.getElementById('exportPdfBtn').addEventListener('click', exportSummaryPdf);
}

/**
 * 绑定成员消费明细 Modal 里的「汇出 PDF」按钮：只汇出目前这一位成员的报告，
 * 不含其他成员或整趟旅程的总览资料
 */
function initMemberPdfExport() {
  document.getElementById('exportMemberPdfBtn').addEventListener('click', async () => {
    if (!currentMemberDetailName) {
      return;
    }

    await autoFetchMissingRatesForExport();

    // 只有查看自己、而且勾选框当下确实可见（代表真的有私人消费可以附加）才会
    // 真的带上私人消费章节——即使有人想办法在看别人时把这个 checkbox 的 value
    // 弄成 true，buildSingleMemberReportHtml() 内部也会再检查一次是不是自己，
    // 不完全信任这里的画面状态
    const includePersonalCheckbox = document.getElementById('includePersonalInReportCheckbox');
    const includePersonal = !!(includePersonalCheckbox && includePersonalCheckbox.checked);

    document.getElementById('printReport').innerHTML = buildSingleMemberReportHtml(currentMemberDetailName, includePersonal);
    await waitForReportImagesToLoad_();

    const tripName = getTripName(currentTripId) || t('report.untitledTrip');
    maybeShowPrintQualityHint_();
    printWithFilename(`DivvyDuck · ${sanitizeForFilename(tripName)}-${sanitizeForFilename(currentMemberDetailName)}`);
  });
}

/**
 * 组出「单一成员」的精简版报告：元数据表头 + 这位成员的消费明细与还款纪录
 * 版面沿用整份报告的同一套审计级极简样式，只是范围缩小到一个人
 * @param {string} name 成员姓名
 * @return {string} 报告的 HTML 字串
 */
/**
 * 组出「单一成员」的完整内容主体：结算摘要＋净结算金额、谁欠你钱／你欠谁钱、
 * 个人消费明细、代付明细、双向还款纪录——这一份内容同时被两个入口共用：
 * 1) 结算总览 PDF 里每位成员的小节（buildMemberReportSection）
 * 2) 同行页成员详情汇出的单人 PDF（buildSingleMemberReportHtml）
 * 两处以前是各自独立写的两套逻辑，资讯量长期对不齐（例如总览版少了净结算金额、
 * 代付明细，还款表还漏列「收到的」那一半）；抽成同一个函式后，往后只会改一处，
 * 不会再出现两份 PDF 看到不同内容的情况
 * @param {string} name 成员姓名
 * @return {string} HTML 字串（不含各自的 header／footer）
 */
function buildMemberReportBody(name) {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const memberId = appState.memberIndex && appState.memberIndex.byName[name];

  const stat = (appState.summary.balances || []).find((item) => item.name === name) ||
    { paid: 0, shouldPay: 0, repaid: 0, balance: 0 };

  const relatedExpenses = appState.expenses
    .filter((expense) => expense.PayerId === memberId || (expense.ParticipantIds || []).includes(memberId))
    .sort((a, b) => new Date(a.Date) - new Date(b.Date));

  const relatedRepayments = appState.repayments
    .filter((repayment) => repayment.FromMemberId === memberId || repayment.ToMemberId === memberId)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date));

  // 分开累计「已还给别人」跟「已收到别人的」，两个方向不能混在同一个数字里
  const repaidByMe = relatedRepayments
    .filter((repayment) => repayment.FromMemberId === memberId)
    .reduce((sum, item) => sum + Number(item.Amount || 0), 0);
  const receivedByMe = relatedRepayments
    .filter((repayment) => repayment.ToMemberId === memberId)
    .reduce((sum, item) => sum + Number(item.Amount || 0), 0);

  // 逐笔拆解：属于自己的份额（个人消费，进消费明细）与自己身为付款人付出的全额
  // （进支付明细——不是只算「代付超出自己那份」的差额，是这笔钱真的从自己口袋流出去的全额）
  const personalRows = [];
  const paidExpenseRows = [];

  relatedExpenses.forEach((expense) => {
    const isParticipant = (expense.ParticipantIds || []).includes(memberId);
    const isPayer = expense.PayerId === memberId;
    const splitResult = calculateExpenseSplitClientSide(expense);
    const ownShare = isParticipant ? (splitResult[name] !== undefined ? splitResult[name] : 0) : 0;

    if (ownShare > AMOUNT_TOLERANCE) {
      personalRows.push({ date: expense.Date, html: buildPersonalExpenseTableRow(expense, ownShare) });
    }

    if (isPayer && Number(expense.Amount) > AMOUNT_TOLERANCE) {
      paidExpenseRows.push({
        date: expense.Date,
        html: buildOutflowRow(
          expense.Date,
          expense.Description || translateCategory(expense.Category),
          formatCategoryType(expense.Category),
          expense.Amount,
          expense.Currency,
          expense.ExchangeRateSnapshot
        )
      });
    }
  });

  // 金库相关的三种「个人份额」，等一下会分别并进消费明细／支付明细／收款明细，
  // 只算这位成员「加入这趟旅程之後」发生的交易（见 computeMemberPoolShares_）。
  // 金库户口内的外币支出／收款一律免换算：直接以各自的币种结算与呈现，
  // 不折算回基准货币，因此这里用「依币种分组」而非折算成单一数字
  const poolShares = computeMemberPoolShares_(name);
  const poolDeductExpenses = poolShares.poolDeductExpenses;
  const poolTopups = poolShares.poolTopups;
  const poolConsumptionBreakdown = poolShares.consumptionBreakdown;
  const poolTopupBreakdown = poolShares.topupBreakdown;
  const poolRefundTxs = poolShares.poolRefundTxs;
  const poolRefundBreakdown = poolShares.refundBreakdown;

  // ---------- 个人结算摘要：小型汇总表 + 醒目的净结算金额 ----------
  const isReceivable = stat.balance > AMOUNT_TOLERANCE;
  const isPayable = stat.balance < -AMOUNT_TOLERANCE;
  const netLineClass = isReceivable ? 'is-receive' : (isPayable ? 'is-owe' : '');
  const netLineText = isReceivable
    ? t('personalReport.netReceivable', { amount: formatMoney(stat.balance, baseCurrency) })
    : (isPayable ? t('personalReport.netPayable', { amount: formatMoney(Math.abs(stat.balance), baseCurrency) }) : t('personalReport.netSettled'));

  // 已付金额＝下面「支付明细」表尾的总数：消费付出全额 + 登记打款进金库的预付款
  // + 另外还给别人的还款，三笔都是真的从自己口袋流出去的钱，摘要表跟支付明细
  // 要显示同一份资料，这里提前算好，两处共用。多币种时按币种分别累加并列显示
  // （如「MYR 1,000.00 + CNY 500.00」），不会把不同币种的原始金额直接加总
  const outflowBreakdown = buildMixedCurrencyBreakdown(baseCurrency, stat.paid + repaidByMe, poolTopupBreakdown);
  const consumptionBreakdown = buildMixedCurrencyBreakdown(baseCurrency, stat.shouldPay, poolConsumptionBreakdown);
  const incomeBreakdown = buildMixedCurrencyBreakdown(baseCurrency, receivedByMe, poolRefundBreakdown);

  const summaryHtml = `
    <table class="report-table pr-summary-table">
      <tbody>
        ${outflowBreakdown.length > 0 ? `<tr><td>${escapeHtml(t('personalReport.summaryPaid'))}</td><td class="align-right">${escapeHtml(formatCurrencyBreakdownText(outflowBreakdown))}</td></tr>` : ''}
        <tr><td>${escapeHtml(t('personalReport.summaryOwnExpense'))}</td><td class="align-right">${escapeHtml(formatCurrencyBreakdownText(consumptionBreakdown))}</td></tr>
        ${incomeBreakdown.length > 0 ? `<tr><td>${escapeHtml(t('personalReport.summaryReceived'))}</td><td class="align-right">${escapeHtml(formatCurrencyBreakdownText(incomeBreakdown))}</td></tr>` : ''}
      </tbody>
    </table>
    <p class="pr-net-line ${netLineClass}">${escapeHtml(netLineText)}</p>
  `;

  // ---------- 谁欠你钱 / 你需要支付给：表格呈现 ----------
  const relatedSettlements = (appState.summary.settlements || []).filter(
    (item) => item.from === name || item.to === name
  );

  let settlementHtml = '';
  const owesYou = relatedSettlements.filter((item) => item.to === name);
  const youOwe = relatedSettlements.filter((item) => item.from === name);

  if (owesYou.length > 0) {
    const rows = owesYou.map((item) => `
      <tr><td>${escapeHtml(getExpensePayerDisplay(item.from))}</td><td class="align-right pr-amount-receive">${escapeHtml(formatMoney(item.amount, baseCurrency))}</td></tr>
    `).join('');
    settlementHtml += `
      <div class="pr-section-block">
        <p class="pr-section-title">${escapeHtml(t('personalReport.owesYouTable'))}</p>
        <table class="report-table">
          <thead><tr><th>${escapeHtml(t('personalReport.counterparty'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  if (youOwe.length > 0) {
    const rows = youOwe.map((item) => `
      <tr><td>${escapeHtml(getExpensePayerDisplay(item.to))}</td><td class="align-right pr-amount-owe">${escapeHtml(formatMoney(item.amount, baseCurrency))}</td></tr>
    `).join('');
    settlementHtml += `
      <div class="pr-section-block">
        <p class="pr-section-title">${escapeHtml(t('personalReport.youOweTable'))}</p>
        <table class="report-table">
          <thead><tr><th>${escapeHtml(t('personalReport.counterparty'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  if (relatedSettlements.length === 0) {
    settlementHtml = `<p class="pr-settled-note">${escapeHtml(t('personalReport.allSettled'))}</p>`;
  }

  // ---------- 消费明细：个人拆账份额 + 金库支出份额，合并成一张表 ----------
  // 逻辑上都是「这个人实际吃/用掉了什么」，金库支出只是钱从公共账户出，
  // 跟拆账消费本质相同，不需要分开列成两张表。表头统一为「日期 / 项目 / 类型 / 金额」，
  // 「类型」欄位统一采用「大类 · 子类别」格式（例如「消费 · 住宿」）
  let itemsHtml = '';

  // 消费明细项目名後面标记「这一行是金库均摊」用的极简线条图标（钱币叠），
  // 跟报告其他描边标签（.report-split-tag）同一质感——空心线条、跟着
  // .report-pool-icon 的 currentColor 走报告的灰阶，不是彩色 emoji
  const poolIconSvg = `<svg class="report-pool-icon" viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><ellipse cx="7" cy="4" rx="5" ry="2"/><path d="M2 4v6a5 2 0 0 0 10 0V4"/><path d="M2 7a5 2 0 0 0 10 0"/></svg>`;

  const poolConsumptionRows = poolDeductExpenses.map((expense) => {
    const perPersonShare = getPoolDeductShareAmount_(expense);
    return {
      date: expense.Date,
      html: `
      <tr>
        <td>${escapeHtml(formatDateDisplay(expense.Date))}</td>
        <td class="report-cell-wrap">${escapeHtml(expense.Description || translateCategory(expense.Category))} <span title="${escapeHtml(t('personalReport.poolIconLabel'))}">${poolIconSvg}</span></td>
        <td>${escapeHtml(formatCategoryType(expense.Category))}</td>
        <td class="align-right">${escapeHtml(formatMoney(perPersonShare, expense.Currency))}</td>
      </tr>
    `
    };
  });

  const combinedConsumptionRows = personalRows.concat(poolConsumptionRows);
  const combinedConsumptionCount = personalRows.length + poolConsumptionRows.length;

  if (combinedConsumptionRows.length > 0) {
    itemsHtml += `
      <div class="pr-section-block-flexible pr-page-break-before">
        <p class="pr-section-title">${escapeHtml(t('personalReport.expenseSection'))}</p>
        <table class="report-table pr-detail-table">
          <thead><tr><th>${escapeHtml(t('table.date'))}</th><th>${escapeHtml(t('table.item'))}</th><th>${escapeHtml(t('personalReport.typeColumn'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
          <tbody>${joinRowsSortedByDate(combinedConsumptionRows)}</tbody>
          <tfoot>
            <tr class="report-table-total-row">
              <td colspan="4" class="pr-total-row-cell">
                <div class="pr-total-row-inner">
                  <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: combinedConsumptionCount }))}</span>
                  <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(consumptionBreakdown))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
        ${poolConsumptionRows.length > 0 ? `<p class="report-pool-legend">*${poolIconSvg} ${escapeHtml(t('personalReport.poolIconLegend'))}</p>` : ''}
      </div>
    `;
  }

  // ---------- 支付明细（钱流出去）：已付过的消费全额 + 金库预付款 + 还给别人的还款，
  //            统一成「日期 / 项目 / 类型 / 金额」四欄，合并成一张表。
  //            金库预付款是金库户口的钱，免换算，只显示原始币值（不做「→ 折算」提示） ----------
  const poolTopupRows = poolTopups.map((item) => ({
    date: item.createdAt,
    html: buildOutflowRow(
      item.createdAt,
      t('personalReport.poolTopupItem'),
      t('personalReport.typePoolTopup'),
      item.perPersonAmount,
      item.currency,
      undefined,
      true
    )
  }));

  const repaidRows = relatedRepayments
    .filter((repayment) => repayment.FromMemberId === memberId)
    .map((repayment) => ({
      date: repayment.Date,
      html: buildOutflowRow(
        repayment.Date,
        t('personalReport.paidToItem', { name: getExpensePayerDisplay(repayment.ToMember) }),
        t('personalReport.typeRepaymentOut'),
        repayment.Amount,
        baseCurrency
      )
    }));

  const combinedOutflowRows = paidExpenseRows.concat(poolTopupRows, repaidRows);

  itemsHtml += `
    <div class="pr-section-block-flexible">
      <p class="pr-section-title">${escapeHtml(t('personalReport.outflowSection'))}</p>
      ${combinedOutflowRows.length > 0 ? `
        <table class="report-table pr-detail-table">
          <thead><tr><th>${escapeHtml(t('table.date'))}</th><th>${escapeHtml(t('table.item'))}</th><th>${escapeHtml(t('personalReport.typeColumn'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
          <tbody>${joinRowsSortedByDate(combinedOutflowRows)}</tbody>
          <tfoot>
            <tr class="report-table-total-row">
              <td colspan="4" class="pr-total-row-cell">
                <div class="pr-total-row-inner">
                  <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: combinedOutflowRows.length }))}</span>
                  <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(outflowBreakdown))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      ` : `<p class="pr-settled-note">${escapeHtml(t('personalReport.noOutflow'))}</p>`}
    </div>
  `;

  // ---------- 收款明细（收到钱）：别人还给我的钱 + 金库结程退回的余额，
  //            统一成「日期 / 项目 / 类型 / 金额」四欄，合并成一张表。
  //            金库退款一律免换算，不分币种全部列入（不再只挑基准货币那笔） ----------
  // 金库结程退余刻意不写进 Repayments 表（见 Code.gs handleSettlePool 的说明，
  // 均分退款如果拿去抵扣应收/应付，会让债权人的应收金额被不合理地少算一块），
  // 所以退款要直接从 pool.transactions 读，不是从 relatedRepayments 来；
  // 这里看的是「有没有退款的历史纪录」，不是「目前刚好结清」——结程後还能继续
  // 充值开始新的一轮，用目前状态来筛的话，充值後历史上的退款反而会不见
  const poolRefundRows = poolRefundTxs.map((tx) => ({
    date: tx.createdAt,
    html: buildOutflowRow(
      tx.createdAt,
      t('personalReport.receivedFromItem', { name: t('pool.expense.payerDisplayName') }),
      tx.type === 'expense_refund' ? t('personalReport.typePoolExpenseRefund') : t('personalReport.typePoolRefund'),
      tx.amount / (tx.memberCountSnapshot || appState.members.length || 1),
      tx.currency,
      undefined,
      true
    )
  }));

  const receivedRows = relatedRepayments
    .filter((repayment) => repayment.ToMemberId === memberId)
    .map((repayment) => ({
      date: repayment.Date,
      html: buildOutflowRow(
        repayment.Date,
        t('personalReport.receivedFromItem', { name: getExpensePayerDisplay(repayment.FromMember) }),
        t('personalReport.typeRepaymentIn'),
        repayment.Amount,
        baseCurrency
      )
    }))
    .concat(poolRefundRows);

  itemsHtml += `
    <div class="pr-section-block-flexible">
      <p class="pr-section-title">${escapeHtml(t('personalReport.incomeSection'))}</p>
      ${receivedRows.length > 0 ? `
        <table class="report-table pr-detail-table">
          <thead><tr><th>${escapeHtml(t('table.date'))}</th><th>${escapeHtml(t('table.item'))}</th><th>${escapeHtml(t('personalReport.typeColumn'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
          <tbody>${joinRowsSortedByDate(receivedRows)}</tbody>
          <tfoot>
            <tr class="report-table-total-row">
              <td colspan="4" class="pr-total-row-cell">
                <div class="pr-total-row-inner">
                  <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: receivedRows.length }))}</span>
                  <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(incomeBreakdown))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      ` : `<p class="pr-settled-note">${escapeHtml(t('personalReport.noIncome'))}</p>`}
    </div>
  `;

  return `${summaryHtml}${settlementHtml}${itemsHtml}`;
}

/**
 * 组出「支付明细」／「收款明细」共用的一列，统一「日期 / 项目 / 类型 / 金额」四欄格式，
 * 不管这一列原本是消费全额、金库预付款、代垫归还的哪一种都套同一个模板
 * @param {string} date 日期（yyyy-MM-dd 或可被 formatDateDisplay 解析的字串）
 * @param {string} item 项目说明
 * @param {string} typeLabel 类型标签（已经过 t() 翻译）
 * @param {number} amount 金额
 * @param {string} currency 货币代码
 * @param {number} [snapshotRate] 历史汇率快照（有的话才带，没有就用目前汇率）
 * @param {boolean} [plain] true 时金额只显示原始币值，不做任何换算——金库户口的
 *   外币支出／收款一律免换算（见需求：金库支出免换算），不应该出现「→ 折算成基准货币」的提示
 * @return {string} HTML 字串（一个 <tr>）
 */
function buildOutflowRow(date, item, typeLabel, amount, currency, snapshotRate, plain) {
  const amountHtml = plain ? formatMoney(amount, currency) : formatMoneyWithConversion(amount, currency, snapshotRate);
  return `
    <tr>
      <td>${escapeHtml(formatDateDisplay(date))}</td>
      <td class="report-cell-wrap">${escapeHtml(item)}</td>
      <td>${escapeHtml(typeLabel)}</td>
      <td class="align-right">${amountHtml}</td>
    </tr>
  `;
}

/**
 * 把报告内容包进一个「外层 table」，用 <thead>/<tfoot> 让 Logo（与页尾资讯）在
 * 打印/汇出 PDF 时每一页都正确重复出现。
 *
 * 原本用 position: fixed 做重复表头，理论上符合分页媒体的 CSS 规范，但实测在
 * 手机版 Safari 的汇出 PDF 引擎上并不会重复——只会照一般文件流出现一次，跟随便
 * 一个普通区块没两样。table 的 <thead>/<tfoot> 是浏览器打印引擎支援度最好、
 * 最不容易出包的重复表头/表尾做法（表格分页本来就是每种引擎都要处理好的基本功能），
 * 所以改用这个更保险的实作方式。
 * @param {string} bodyHtml 报告主要内容
 * @param {string} [footerRowHtml] 每页页尾要重复显示的内容（不含外层 <div>），不传就不产生 tfoot
 * @return {string} 包好 <table> 外壳的完整 HTML
 */
function wrapReportPagesWithLogo(bodyHtml, footerRowHtml) {
  return `
    <table class="pr-page-frame">
      <thead>
        <tr>
          <td class="pr-page-frame-head">
            <div class="pr-running-header">
              <span class="pr-running-logo">${REPORT_LOGO_SVG}</span>
            </div>
          </td>
        </tr>
      </thead>
      ${footerRowHtml ? `
      <tfoot>
        <tr>
          <td class="pr-page-frame-foot">
            <div class="pr-running-footer">${footerRowHtml}</div>
          </td>
        </tr>
      </tfoot>
      ` : ''}
      <tbody>
        <tr>
          <td class="pr-page-frame-body">${bodyHtml}</td>
        </tr>
      </tbody>
    </table>
  `;
}

/**
 * 组出单一成员的完整报告 HTML（header + buildMemberReportBody() 的结算内容 +
 * 可选的私人消费独立章节）。供同行页成员详情页的「汇出 PDF」使用
 * @param {string} name 成员姓名
 * @param {boolean} [includePersonal] 是否要在最後附加「私人消费」独立章节——
 *   只有汇出的是自己、且这个参数为 true 时才会真的附加，见 buildPersonalExpenseReportSection_()
 * @return {string} HTML 字串
 */
function buildSingleMemberReportHtml(name, includePersonal) {
  const tripName = getTripName(currentTripId) || t('report.untitledTrip');
  const generatedAt = formatDateTimeForReport(new Date());
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const reportId = buildReportTrackingId();

  // ---------- Header：封面页大标题，不放 Logo（Logo 改放每页都会重复的 thead）；
  // 补上跟结算总览 PDF 同一套 report-meta-grid，生成时间／报告编号／结算货币
  // 用一样正式的标签＋数值呈现，不再只塞在页尾一行小字里——两份报告看起来才是
  // 「同一个产品家族」，不是各写各的两套版面 ----------
  const headerHtml = `
    <div class="pr-header">
      <h1 class="pr-header-name">${escapeHtml(name)}</h1>
      <p class="pr-header-trip">${escapeHtml(tripName)} · ${escapeHtml(t('report.personalBalanceSummary'))}</p>
      <div class="report-meta-grid">
        <div class="report-meta-item">
          <span class="report-meta-label">${escapeHtml(t('report.generatedAt'))}</span>
          <span class="report-meta-value">${escapeHtml(generatedAt)}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-label">${escapeHtml(t('report.reportId'))}</span>
          <span class="report-meta-value">${escapeHtml(reportId)}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-label">${escapeHtml(t('report.settleCurrency'))}</span>
          <span class="report-meta-value">${escapeHtml(baseCurrency)}</span>
        </div>
      </div>
    </div>
  `;

  const bodyHtml = buildMemberReportBody(name);

  // 私人消费独立章节：只有汇出的是自己、而且有勾选才附加——这里不完全信任
  // initMemberPdfExport() 传进来的 includePersonal，name === getViewerName()
  // 再检查一次，双重保险（配合 RLS，其实看别人时 appState.personalExpenses
  // 本来就不会有资料，但函式签名上不该假设呼叫端一定会做对这个判断）
  const personalSectionHtml = (includePersonal && name === getViewerName())
    ? buildPersonalExpenseReportSection_()
    : '';

  // ---------- Footer：改成每页都重复出现在页底，而不是只出现在最后一页 ----------
  const footerRowHtml = `
    <span>${escapeHtml(t('report.reportId'))}: ${escapeHtml(reportId)}</span>
    <span>${escapeHtml(t('report.generatedAt'))}: ${escapeHtml(generatedAt)} · ${escapeHtml(baseCurrency)}</span>
  `;

  return wrapReportPagesWithLogo(`<div class="pr-report">${headerHtml}${bodyHtml}${personalSectionHtml}</div>`, footerRowHtml);
}

/**
 * 组出「私人消费」这个独立章节的 HTML——只在汇出自己的个人报告、且有勾选
 * 「包含我的私人消费」时才会被拼进 buildSingleMemberReportHtml() 的结果里。
 * 刻意跟 buildMemberReportBody() 的结算表格完全分开、不共用任何加总，用
 * report-footer-note 那个既有的「小字免责声明」样式醒目标注「这个章节不参与
 * 群组结算」，避免任何人把这部分金额误算进净结算/应收应付
 * @return {string} HTML 字串；appState.personalExpenses 是空的话回传空字串
 */
function buildPersonalExpenseReportSection_() {
  if (!appState.personalExpenses || appState.personalExpenses.length === 0) {
    return '';
  }

  const rows = appState.personalExpenses.map((expense) => ({
    date: expense.Date,
    html: buildPersonalExpenseTableRow(expense, expense.Amount)
  }));

  const breakdown = groupAmountsByCurrency(appState.personalExpenses, (item) => item.Amount, (item) => item.Currency);

  return `
    <div class="pr-section-block-flexible pr-page-break-before">
      <p class="pr-section-title">${escapeHtml(t('personalReport.personalExpenseSection'))}</p>
      <p class="report-footer-note">${escapeHtml(t('personalReport.personalExpenseDisclaimer'))}</p>
      <table class="report-table pr-detail-table">
        <thead><tr><th>${escapeHtml(t('table.date'))}</th><th>${escapeHtml(t('table.item'))}</th><th>${escapeHtml(t('personalReport.typeColumn'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr></thead>
        <tbody>${joinRowsSortedByDate(rows)}</tbody>
        <tfoot>
          <tr class="report-table-total-row">
            <td colspan="4" class="pr-total-row-cell">
              <div class="pr-total-row-inner">
                <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: appState.personalExpenses.length }))}</span>
                <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(breakdown))}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

/**
 * 组出「个人实际消费」表格里的一列
 * @param {Object} expense 消费纪录物件
 * @param {number} ownShare 自己的消费份额
 * @return {string} HTML 字串（<tr>）
 */
function buildPersonalExpenseTableRow(expense, ownShare) {
  const { title } = splitTitleAndSubtitle(expense.Description || translateCategory(expense.Category));
  return `
    <tr>
      <td>${escapeHtml(formatDateDisplay(expense.Date))}</td>
      <td class="report-cell-wrap">${escapeHtml(title || translateCategory(expense.Category))}</td>
      <td>${escapeHtml(formatCategoryType(expense.Category))}</td>
      <td class="align-right">${formatMoneyWithConversion(ownShare, expense.Currency, expense.ExchangeRateSnapshot)}</td>
    </tr>
  `;
}

/**
 * 把消费说明文字拆成「干净标题」+「小字副标题」：
 * 结尾若有括号备注（例如日期区间），会被拆出来单独放在副标题，主标题保持干净俐落
 * @param {string} description 原始说明文字
 * @return {{title: string, subtitle: string}}
 */
function splitTitleAndSubtitle(description) {
  const text = (description || '').trim();
  const match = text.match(/^(.*?)\s*([（(][^）)]*[）)])\s*$/);

  if (match && match[1].trim()) {
    return { title: match[1].trim(), subtitle: match[2] };
  }

  return { title: text, subtitle: '' };
}

/**
 * 汇出 PDF 前自动检查是否有货币尚未设定汇率，若有就依序向 Wise 抓取即时汇率并直接储存
 * （抓到的汇率会一併存进 Backend，之后的结算总览、建议还款也会跟着受惠，不只是这次的 PDF）
 * 抓取失败的货币会保持未设定状态，PDF 报告里会照实标注，不会用错误的汇率误导使用者
 */
async function autoFetchMissingRatesForExport() {
  const missingCurrencies = getMissingExchangeRateCurrencies();
  if (missingCurrencies.length === 0) {
    return;
  }

  showLoading(t('loading.fetchingRates'));

  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const fetchedRates = {};

  for (const currency of missingCurrencies) {
    try {
      const result = await fetchLiveRate_(currency, baseCurrency);
      fetchedRates[currency] = result.rate;
    } catch (error) {
      // 单一货币抓取失败不影响其他货币，继续尝试下一个即可
    }
  }

  if (Object.keys(fetchedRates).length > 0) {
    try {
      appState.tripCurrency = await saveExchangeRates_({ rates: fetchedRates });
      renderCurrencySettings();
    } catch (error) {
      // 储存失败也不影响 PDF 继续汇出，只是这次抓到的汇率不会被记住
    }
  }

  hideLoading();
}

/**
 * 把一批消费统一折算成旅程的基准货币后加总，回传单一数字
 * 与 Backend calculateSummary 的换算逻辑一致：优先用每笔消费自己的历史汇率快照
 * （ExchangeRateSnapshot），没有快照的旧资料才 fallback 用旅程目前的汇率
 * （这是唯一正确的多币种总额呈现方式，绝不能把不同货币的原始金额直接相加或拼接）
 * @param {Array<Object>} expenses 消费纪录阵列
 * @return {number} 折算后的基准货币总额
 */
function computeBaseCurrencyTotal(expenses) {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const rates = appState.tripCurrency.rates || {};

  return expenses.reduce((sum, expense) => {
    const currency = expense.Currency || baseCurrency;
    let rate = 1;
    if (currency !== baseCurrency) {
      const snapshot = expense.ExchangeRateSnapshot;
      rate = (snapshot !== undefined && snapshot !== null && !isNaN(snapshot) && snapshot > 0)
        ? snapshot
        : (rates[currency] !== undefined ? rates[currency] : 1);
    }
    return Math.round((sum + expense.Amount * rate) * 100) / 100;
  }, 0);
}

/**
 * 把「依货币分组的加总结果」格式化成括号註记文字，例如 "MYR 25,000.00、EUR 1,000.00"
 * 用于在统一折算后的大数字底下，轻量标注原始币值明细（不是拿来加总用的）
 * @param {Array<{currency: string, total: number}>} breakdown groupAmountsByCurrency 的回传值
 * @return {string} 括号内文字，单一货币时回传空字串（不需要多此一举標注）
 */
function formatOriginalCurrencyNote(breakdown) {
  if (breakdown.length <= 1) {
    return '';
  }
  return breakdown.map((item) => formatMoney(item.total, item.currency)).join('、');
}

function buildPrintReportHtml() {
  const tripName = getTripName(currentTripId) || t('report.untitledTrip');
  const generatedAt = formatDateTimeForReport(new Date());
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const totalBreakdown = groupAmountsByCurrency(appState.expenses, (item) => item.Amount, (item) => item.Currency);
  const totalAmountBase = computeBaseCurrencyTotal(appState.expenses);
  const originalCurrencyNote = formatOriginalCurrencyNote(totalBreakdown);
  const hasMissingRate = getMissingExchangeRateCurrencies().length > 0;
  const reportId = buildReportTrackingId();

  const overviewSection = `
    <div class="report-section report-section-first">
      <div class="report-header">
        <div class="report-header-top">
          <div>
            <p class="report-title">${escapeHtml(tripName)}${escapeHtml(t('report.titleSuffix'))}</p>
          </div>
        </div>
        <div class="report-meta-grid">
          <div class="report-meta-item">
            <span class="report-meta-label">${escapeHtml(t('report.generatedAt'))}</span>
            <span class="report-meta-value">${escapeHtml(generatedAt)}</span>
          </div>
          <div class="report-meta-item">
            <span class="report-meta-label">${escapeHtml(t('report.reportId'))}</span>
            <span class="report-meta-value">${escapeHtml(reportId)}</span>
          </div>
          <div class="report-meta-item">
            <span class="report-meta-label">${escapeHtml(t('report.settleCurrency'))}</span>
            <span class="report-meta-value">${escapeHtml(baseCurrency)}</span>
          </div>
          <div class="report-meta-item report-meta-item-wide">
            <span class="report-meta-label">${escapeHtml(t('report.memberLabel'))}</span>
            <span class="report-meta-value report-meta-value-wrap">${escapeHtml(appState.members.join('、') || '—')}</span>
          </div>
        </div>
      </div>

      <h2>${escapeHtml(t('report.executiveSummary'))}</h2>
      <div class="report-summary-grid">
        <div class="report-summary-card">
          <p class="report-summary-card-label">${escapeHtml(t('report.totalAmount'))}</p>
          <p class="report-summary-card-value">${escapeHtml(formatMoney(totalAmountBase, baseCurrency))}${hasMissingRate ? '<span class="report-asterisk">*</span>' : ''}</p>
          ${originalCurrencyNote ? `<p class="report-summary-card-note">(${escapeHtml(t('report.originalCurrency'))}：${escapeHtml(originalCurrencyNote)})</p>` : ''}
        </div>
        <div class="report-summary-card">
          <p class="report-summary-card-label">${escapeHtml(t('report.expenseCount'))}</p>
          <p class="report-summary-card-value">${appState.expenses.length}</p>
        </div>
        <div class="report-summary-card">
          <p class="report-summary-card-label">${escapeHtml(t('report.memberCount'))}</p>
          <p class="report-summary-card-value">${appState.members.length}</p>
        </div>
      </div>

      ${buildExchangeRateOverviewTable(hasMissingRate)}
      ${buildCategoryReportTable()}
    </div>
  `;

  const expenseDetailSection = `
    <div class="report-section">
      <h2>${escapeHtml(t('report.expenseDetailList'))}</h2>
      ${buildExpenseDetailReportTable()}
    </div>
  `;

  const balanceSection = `
    <div class="report-section">
      <h2>${escapeHtml(t('report.balanceOverview'))}</h2>
      ${buildBalanceReportTable()}
    </div>
  `;

  const settlementSection = `
    <div class="report-section report-section-no-break">
      <h2>${escapeHtml(t('report.suggestedSettlements'))}</h2>
      <p class="report-summary-row" style="border: none; padding-top: 0;">${escapeHtml(t('report.settlementDisclaimer'))}</p>
      ${buildSettlementReportTable()}
    </div>
  `;

  const poolSection = buildPoolReportSection();

  // 每位成员各自独立一个 report-section，代表各自从新的一页开始，
  // 不会跟其他成员或其他段落的内容混在一起；
  // 第一位成员额外加上 report-page-break-before，确保「个人消费明细」这个章节一定另起新页
  const memberSections = appState.members
    .map((name, index) => `<div class="report-section${index === 0 ? ' report-page-break-before' : ''}">${buildMemberReportSection(name)}</div>`)
    .join('');

  return wrapReportPagesWithLogo(overviewSection + expenseDetailSection + balanceSection + settlementSection + poolSection + memberSections);
}

/**
 * 组出「搭伙金库」报告章节：充值明细、支出明细（金库支出／代垫归还）、
 * 退余明细（结程後的每人退款明细）——这一段独立于一般消费的拆账逻辑，金库支出这种
 * 没有真人垫付的消费不会出现在任何一位成员的个人小节里，这里是它们唯一能被完整看到的地方
 * 没开金库的旅程回传空字串，报告里不会多出一个空章节
 * @return {string} HTML 字串
 */
function buildPoolReportSection() {
  const pool = appState.pool;
  if (!pool || !pool.enabled) return '';

  const topups = pool.topups || [];
  const topupRows = topups.map((item) => `
    <tr>
      <td>${escapeHtml(formatDateDisplay(item.createdAt))}</td>
      <td>${item.memberCount}</td>
      <td class="align-right">${escapeHtml(formatMoney(item.perPersonAmount, item.currency))}</td>
      <td class="align-right">${escapeHtml(formatMoney(item.totalAmount, item.currency))}</td>
    </tr>
  `).join('');
  // 充值明细的合计，依币种分别累加并列显示（免换算），跟其他明细的合计同一套规则
  const topupTotalBreakdown = groupAmountsByCurrency(topups, (item) => item.totalAmount, (item) => item.currency);

  const txTypeLabel = {
    deduct: t('pool.report.typeDeduct'),
    reimburse: t('pool.report.typeReimburse'),
    refund: t('pool.report.typeRefund')
  };
  // 「支出明细」只放金库支出／代垫归还这两种真正的支出，退余(refund)、消费退款
  // (expense_refund，删除已结算金库消费時补记的那笔) 都改到独立的「退余明细」
  // 章节呈现（见下方 refundSection），这里不再重复列出——两者都是「钱退回去」，
  // 不是新的支出，混在支出明细裡会看起来像多花了一笔錢
  const nonRefundTxs = (pool.transactions || []).filter((tx) => tx.type !== 'refund' && tx.type !== 'expense_refund');
  const txRows = nonRefundTxs.map((tx) => `
    <tr>
      <td>${escapeHtml(formatDateDisplay(tx.createdAt))}</td>
      <td class="report-cell-wrap">${escapeHtml(tx.note || '')}${tx.memberName ? ' · ' + escapeHtml(tx.memberName) : ''}</td>
      <td class="align-right">${escapeHtml(txTypeLabel[tx.type] || tx.type)}</td>
      <td class="align-right">${escapeHtml(formatMoney(tx.amount, tx.currency))}</td>
    </tr>
  `).join('');
  const txTotalBreakdown = groupAmountsByCurrency(nonRefundTxs, (tx) => tx.amount, (tx) => tx.currency);

  // 退款章节改看「有没有退款的历史纪录」，不是「目前刚好结清」——结程後还能继续
  // 充值开始新的一轮，isTripSettled 只反映「此时此刻」的余额状态，用它来决定这个
  // 章节要不要出现的话，充值後历史上的退款记录反而会不见，报告应该是完整的流水账。
  // expense_refund（已结算的金库消费被删除时补记的退款）本质上也是「钱退回去」，
  // 一併收进这个章节，只是「处理方式」这栏文字换成「消费退款」跟结程退余的
  // 「现金退还」区分开——这就是使用者要的「报告里可以注明是消费退款」
  const allRefundTxs = (pool.transactions || []).filter((tx) => tx.type === 'refund' || tx.type === 'expense_refund');
  let refundSection = '';
  if (allRefundTxs.length > 0) {
    const memberCount = appState.members.length || 1;
    const refundRows = allRefundTxs.map((tx) => {
      // expense_refund 已经在 pool_expense_delete() 後端算好 member_count_snapshot
      // (删除当下的成员人数)，退余(refund) 则沿用报告一贯的「用目前人数」算法
      const perPersonCount = tx.type === 'expense_refund' ? (tx.memberCountSnapshot || memberCount) : memberCount;
      const perPerson = tx.amount / perPersonCount;
      const treatmentNote = tx.type === 'expense_refund' ? t('pool.report.expenseRefundNote') : t('pool.report.cashRefundNote');
      return `
        <tr>
          <td>${escapeHtml(formatDateDisplay(tx.createdAt))}</td>
          <td>${escapeHtml(treatmentNote)} [${escapeHtml(tx.currency)}]</td>
          <td class="align-right">${escapeHtml(formatMoney(tx.amount, tx.currency))}</td>
          <td class="align-right">${escapeHtml(formatMoney(perPerson, tx.currency))}</td>
        </tr>
      `;
    }).join('');
    const refundTotalBreakdown = groupAmountsByCurrency(allRefundTxs, (tx) => tx.amount, (tx) => tx.currency);

    refundSection = `
      <h3>${escapeHtml(t('pool.report.refundTitle'))}</h3>
      <table class="report-table pool-detail-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('table.date'))}</th>
            <th>${escapeHtml(t('pool.report.treatment'))}</th>
            <th class="align-right">${escapeHtml(t('pool.report.totalRefund'))}</th>
            <th class="align-right">${escapeHtml(t('pool.report.perPersonRefund'))}</th>
          </tr>
        </thead>
        <tbody>${refundRows}</tbody>
        <tfoot>
          <tr class="report-table-total-row">
            <td colspan="4" class="pr-total-row-cell">
              <div class="pr-total-row-inner">
                <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: allRefundTxs.length }))}</span>
                <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(refundTotalBreakdown))}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
      <p class="report-summary-row" style="border: none;">${escapeHtml(t('pool.report.membersListNote', { members: appState.members.join('、') }))}</p>
    `;
  }

  return `
    <div class="report-section report-page-break-before">
      <h2>${escapeHtml(t('pool.report.sectionTitle'))}</h2>

      <h3>${escapeHtml(t('pool.report.topupTitle'))}</h3>
      ${topupRows ? `
        <table class="report-table pool-detail-table">
          <thead>
            <tr>
              <th>${escapeHtml(t('table.date'))}</th>
              <th>${escapeHtml(t('pool.report.memberCount'))}</th>
              <th class="align-right">${escapeHtml(t('pool.report.perPerson'))}</th>
              <th class="align-right">${escapeHtml(t('table.amount'))}</th>
            </tr>
          </thead>
          <tbody>${topupRows}</tbody>
          <tfoot>
            <tr class="report-table-total-row">
              <td colspan="4" class="pr-total-row-cell">
                <div class="pr-total-row-inner">
                  <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: topups.length }))}</span>
                  <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(topupTotalBreakdown))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>` : `<p class="report-summary-row">${escapeHtml(t('pool.report.noTopups'))}</p>`}

      <h3>${escapeHtml(t('pool.report.transactionsTitle'))}</h3>
      ${txRows ? `
        <table class="report-table pool-detail-table">
          <thead>
            <tr>
              <th>${escapeHtml(t('table.date'))}</th>
              <th>${escapeHtml(t('table.description'))}</th>
              <th class="align-right">${escapeHtml(t('pool.report.type'))}</th>
              <th class="align-right">${escapeHtml(t('table.amount'))}</th>
            </tr>
          </thead>
          <tbody>${txRows}</tbody>
          <tfoot>
            <tr class="report-table-total-row">
              <td colspan="4" class="pr-total-row-cell">
                <div class="pr-total-row-inner">
                  <span class="pr-total-row-label">${escapeHtml(t('report.total', { count: nonRefundTxs.length }))}</span>
                  <span class="pr-total-row-amount">${escapeHtml(formatCurrencyBreakdownText(txTotalBreakdown))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>` : `<p class="report-summary-row">${escapeHtml(t('pool.report.noTransactions'))}</p>`}

      ${refundSection}
    </div>
  `;
}

/**
 * 组出「消费明细清单」表格：这次旅程每一笔消费的完整纪录，依日期由旧到新排序（账本形式）
 * @return {string} HTML 字串
 */
function buildExpenseDetailReportTable() {
  const expenses = [...appState.expenses].sort((a, b) => new Date(a.Date) - new Date(b.Date));

  if (expenses.length === 0) {
    return `<p class="report-summary-row">${escapeHtml(t('report.noExpenseData'))}</p>`;
  }

  const rows = expenses.map((expense) => {
    const splitLabel = getSplitTypeBadgeInfo(expense.SplitType).label;
    const participantCount = (expense.Participants || []).length;
    return `
    <tr>
      <td>${escapeHtml(formatDateDisplay(expense.Date))}</td>
      <td class="report-cell-wrap">${escapeHtml(expense.Description || t('expense.noDescription'))}</td>
      <td>${escapeHtml(translateCategory(expense.Category))}</td>
      <td>${escapeHtml(getExpensePayerDisplay(expense.Payer))}</td>
      <td><span class="report-split-tag">${escapeHtml(splitLabel)}</span>${expense.SplitType === 'pool' ? '' : ' · ' + participantCount}</td>
      <td class="align-right">${formatExpenseAmountDisplay(expense)}</td>
    </tr>
  `;
  }).join('');

  const totalBreakdown = groupAmountsByCurrency(expenses, (item) => item.Amount, (item) => item.Currency);
  const totalAmountBase = computeBaseCurrencyTotal(expenses);
  const originalCurrencyNote = formatOriginalCurrencyNote(totalBreakdown);
  const totalCellText = originalCurrencyNote
    ? `${formatMoney(totalAmountBase, appState.tripCurrency.baseCurrency || 'MYR')}`
    : formatMoney(totalAmountBase, appState.tripCurrency.baseCurrency || 'MYR');

  return `
    <table class="report-table">
      <thead>
        <tr><th>${escapeHtml(t('table.date'))}</th><th>${escapeHtml(t('table.description'))}</th><th>${escapeHtml(t('table.category'))}</th><th>${escapeHtml(t('table.payer'))}</th><th>${escapeHtml(t('report.splitRatio'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="report-table-total-row">
          <td colspan="5">${escapeHtml(t('report.total', { count: expenses.length }))}</td>
          <td class="align-right">${escapeHtml(totalCellText)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

/**
 * 组出「分类消费」表格
 * @return {string} HTML 字串
 */
function buildCategoryReportTable() {
  const data = appState.categorySummary || [];

  if (data.length === 0) {
    return `<p class="report-summary-row">${escapeHtml(t('report.noCategoryData'))}</p>`;
  }

  // 第一页的分类清单改以「货币」为主排序依据，同一货币的分类会排在一起显示——
  // 原始资料（appState.categorySummary）是依「总额由大到小」排的，同一货币的
  // 分类因此常常被穿插打散；这里改成先比货币（基准货币排最前面，其余依字母排序），
  // 货币相同才比总额大小，视觉上会是「一整段 MYR、接着一整段 CNY」这样分组呈现
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const sortedData = [...data].sort((a, b) => {
    if (a.currency !== b.currency) {
      if (a.currency === baseCurrency) return -1;
      if (b.currency === baseCurrency) return 1;
      return a.currency.localeCompare(b.currency);
    }
    return b.total - a.total;
  });

  const rows = sortedData.map((item) => `
    <tr>
      <td>${escapeHtml(translateCategory(item.category))}</td>
      <td>${escapeHtml(item.currency)}</td>
      <td class="align-right">${item.count}</td>
      <td class="align-right">${formatMoney(item.total, item.currency)}</td>
    </tr>
  `).join('');

  return `
    <table class="report-table">
      <thead>
        <tr><th>${escapeHtml(t('table.category'))}</th><th>${escapeHtml(t('table.currency'))}</th><th class="align-right">${escapeHtml(t('table.count'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * 组出「汇率对照表」——放在总览面板显著位置，让审计链路一目了然
 * 单一货币旅程不需要显示；多币种时以清楚的小表格列出每个汇率对，
 * 找不到汇率的货币会标注星号，对应到总消费金额旁边的提醒星号
 * @param {boolean} hasMissingRate 是否有货币尚未设定汇率
 * @return {string} HTML 字串
 */
function buildExchangeRateOverviewTable(hasMissingRate) {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const rates = appState.tripCurrency.rates || {};
  const usedCurrencies = [...new Set(appState.expenses.map((expense) => expense.Currency || baseCurrency))]
    .filter((currency) => currency !== baseCurrency)
    .sort();

  if (usedCurrencies.length === 0) {
    return '';
  }

  const rows = usedCurrencies.map((currency) => {
    const rate = rates[currency];
    const rateText = rate !== undefined
      ? `1 ${currency} = ${cleanNumericString(rate)} ${baseCurrency}`
      : `1 ${currency} = — ${baseCurrency}`;
    const missingTag = rate === undefined ? `<span class="report-asterisk">*</span>` : '';
    return `
      <tr>
        <td>${escapeHtml(rateText)}${missingTag}</td>
      </tr>
    `;
  }).join('');

  const missingFootnote = hasMissingRate
    ? `<p class="report-footer-note"><span class="report-asterisk">*</span> ${escapeHtml(t('report.rateNotSetFootnote'))}</p>`
    : '';

  return `
    <h3>${escapeHtml(t('report.exchangeRatesUsed'))}</h3>
    <table class="report-table">
      <tbody>${rows}</tbody>
    </table>
    ${missingFootnote}
  `;
}

/**
 * 清洗数字字串：修掉浮点数运算常见的丑陋尾数（例如 10.0000000001），
 * 并移除末尾多余的 0 与句点，回传乾净的字串
 * @param {number} value 原始数值
 * @return {string} 清洗后的字串
 */
function cleanNumericString(value) {
  const rounded = Math.round(Number(value) * 1e6) / 1e6; // 汇率保留到小数点后 6 位精度
  return String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * 产生这份报表的追踪 ID，方便日后对账或引用时快速指认「是哪一次汇出的报表」
 * 注意：这是简单的可追溯性代号，不是加密杂凑（cryptographic hash），
 * 不能用来做防伪验证，纯粹是审计追溯用的报表编号
 * @return {string} 例如 "SM-A1B2C3-K9X2"
 */
/**
 * PDF 报表专用的 Logo（横式：图示＋DivvyDuck 字样），跟 App 介面里的方形 App Icon
 * 是不同的版面——报表是白底列印文件，需要一个左右排列、深色文字版本的品牌标识，
 * 不能直接沿用 App 介面那个圆角方块图示。结算总览／同行个人报告的表头都共用这一份，
 * 之后要换报表的品牌视觉，只需要改这一处
 */
const REPORT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 450 130">
  <image x="15" y="15" width="100" height="100" href="assets/report-logo-icon.png" xlink:href="assets/report-logo-icon.png"/>
  <text x="138" y="78" font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" font-size="46" font-weight="800" letter-spacing="-1px">
    <tspan fill="#0F172A">Divvy</tspan><tspan fill="#6366F1">Duck</tspan>
  </text>
</svg>`;

function buildReportTrackingId() {
  const tripPart = (currentTripId || 'TRIP').slice(-6).toUpperCase();
  const timePart = Date.now().toString(36).slice(-5).toUpperCase();
  return `SM-${tripPart}-${timePart}`;
}

/**
 * 组出「每人结算总览」表格——已付金额／个人消费／已收金额三栏，要跟 Hero Card、
 * PDF 每个人小节的摘要表用同一套算法与呈现方式（含金库份额、金库户口免换算、
 * 多币种并列显示），总览表格跟後面每个人的小节数字才不会对不上。
 * 金库份额不是每个人都一样——只算各自「加入这趟旅程之後」发生的交易（见
 * computeMemberPoolShares_），所以要在迴圈里逐人计算，不能只算一次共用
 * @return {string} HTML 字串
 */
function buildBalanceReportTable() {
  const balances = appState.summary.balances || [];

  if (balances.length === 0) {
    return `<p class="report-summary-row">${escapeHtml(t('report.noBalanceData'))}</p>`;
  }

  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';

  const rows = balances.map((item) => {
    const isReceivable = item.balance > AMOUNT_TOLERANCE;
    const isPayable = item.balance < -AMOUNT_TOLERANCE;
    const label = isReceivable ? t('memberStats.receivable') : (isPayable ? t('memberStats.payable') : t('memberStats.settled'));
    const colorClass = isReceivable ? 'report-amount-positive' : (isPayable ? 'report-amount-negative' : '');

    // 每个人的金库份额不再保证完全一样——只算这个人「加入之後」发生的交易，
    // 所以要放进迴圈里逐人计算，不能像以前那样在迴圈外只算一次共用
    const poolShares = computeMemberPoolShares_(item.name);
    const paidBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.paid + (item.repaid || 0), poolShares.topupBreakdown);
    const consumptionBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.shouldPay, poolShares.consumptionBreakdown);
    const receivedBreakdown = buildMixedCurrencyBreakdown(baseCurrency, item.received || 0, poolShares.refundBreakdown);

    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="align-right">${escapeHtml(formatCurrencyBreakdownText(paidBreakdown))}</td>
        <td class="align-right">${escapeHtml(formatCurrencyBreakdownText(consumptionBreakdown))}</td>
        <td class="align-right">${escapeHtml(formatCurrencyBreakdownText(receivedBreakdown))}</td>
        <td class="align-right ${colorClass}">${label} ${formatMoney(Math.abs(item.balance))}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="report-table">
      <thead>
        <tr><th>${escapeHtml(t('report.memberLabel'))}</th><th class="align-right">${escapeHtml(t('personalReport.summaryPaid'))}</th><th class="align-right">${escapeHtml(t('personalReport.summaryOwnExpense'))}</th><th class="align-right">${escapeHtml(t('personalReport.summaryReceived'))}</th><th class="align-right">${escapeHtml(t('table.balance'))}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * 组出「建议还款」表格
 * @return {string} HTML 字串
 */
function buildSettlementReportTable() {
  const settlements = appState.summary.settlements || [];

  if (settlements.length === 0) {
    return `<p class="report-summary-row">${escapeHtml(t('report.allSettled'))}</p>`;
  }

  const rows = settlements.map((item) => `
    <tr>
      <td colspan="2">
        <span class="report-settlement-flow">
          <span>${escapeHtml(item.from)}</span>
          <span class="report-arrow">&rarr;</span>
          <span>${escapeHtml(item.to)}</span>
        </span>
      </td>
      <td class="align-right"><span class="report-settlement-amount">${formatMoney(item.amount)}</span></td>
    </tr>
  `).join('');

  return `
    <table class="report-table">
      <thead>
        <tr><th colspan="2">${escapeHtml(t('report.settlementFlow'))}</th><th class="align-right">${escapeHtml(t('table.amount'))}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * 组出单一成员的完整消费明细区块（消费 + 还款时间轴，与 Modal 内的逻辑一致）
 * @param {string} name 成员姓名
 * @return {string} HTML 字串
 */
/**
 * 组出结算总览 PDF 里「某位成员」的小节：标题 + buildMemberReportBody() 的完整内容
 * 内容跟同行页汇出的单人 PDF 完全一致（摘要、净结算金额、谁欠谁、个人消费、
 * 代付明细、双向还款纪录），不再是简化版，两份 PDF 不会再看到不同的资讯
 * @param {string} name 成员姓名
 * @return {string} HTML 字串
 */
function buildMemberReportSection(name) {
  return `
    <h2>${escapeHtml(t('report.memberSectionTitle', { name }))}</h2>
    ${buildMemberReportBody(name)}
  `;
}


/* ------------------------------------------------------------
   17. Toast 通知
   ------------------------------------------------------------ */

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.7"/><path d="M8 12.3L10.6 15L16 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 11V16.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1" fill="currentColor"/></svg>'
};

function showToast(type, title, message) {
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <div class="toast-content">
      <p class="toast-title">${escapeHtml(title)}</p>
      ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ''}
    </div>
    <button class="toast-close" type="button" aria-label="${escapeHtml(t('toast.closeAriaLabel'))}">
      <svg viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
  `;

  container.appendChild(toast);

  const removeToast = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector('.toast-close').addEventListener('click', removeToast);
  setTimeout(removeToast, TOAST_DURATION_MS);
}


/* ------------------------------------------------------------
   18. 全域 Loading 控制
   ------------------------------------------------------------ */

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || t('common.processing');
  document.getElementById('loadingOverlay').classList.add('is-visible');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('is-visible');
}

function setButtonLoading(button, isLoading) {
  button.classList.toggle('is-loading', isLoading);
  button.disabled = isLoading;
}

/* ------------------------------------------------------------
   19. 共用小型渲染工具
   ------------------------------------------------------------ */

/**
 * 「搭伙鸭」品牌插画 SVG——原本 4 份 .page-empty-hero（Dashboard/账目/结算/同行
 * 各一份）几乎逐字複製了这段，唯一差异是 SVG 渐层的 id 后缀（避免同一份文件裡
 * 出现重複 id）。抽成共用函式，id 后缀由呼叫端带入，不再各自维护一份
 * @param {string} idSuffix 用来让渐层 id 在同一份文件裡保持唯一
 * @return {string}
 */
function buildEmptyStateBrandMarkSvg_(idSuffix) {
  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ddPurple${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E1B4B"/>
          <stop offset="100%" stop-color="#0F172A"/>
        </linearGradient>
        <linearGradient id="ddBeak${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FBBF24"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </linearGradient>
        <linearGradient id="ddBar${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#818CF8"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="24" fill="url(#ddPurple${idSuffix})"/>
      <g transform="rotate(-12, 50, 50)">
        <circle cx="50" cy="27" r="13" fill="#FFFFFF"/>
        <circle cx="54" cy="24" r="2.8" fill="#1E1B4B"/>
        <path d="M 61 25 C 71 25, 75 29, 72 34 C 69 37, 61 34, 61 30 Z" fill="url(#ddBeak${idSuffix})"/>
        <rect x="22" y="46" width="56" height="10" rx="5" fill="url(#ddBar${idSuffix})"/>
        <path d="M 28 67 C 28 67, 38 65, 50 65 C 62 65, 72 67, 72 67 C 72 78, 62 84, 50 84 C 38 84, 28 78, 28 67 Z" fill="#FFFFFF"/>
      </g>
    </svg>
  `;
}

/**
 * 空状态渲染的唯一出口——原本有三条平行的实作：这支函式本身
 * （区块级，专案裡最常用的那一种）、togglePageEmptyHero_() 搭配四份手写在
 * HTML 裡、几乎逐字複製的 .page-empty-hero（页面级，Dashboard/账目/结算/同行
 * 没有任何旅程时的引导画面），以及 Hero Card 自己又手写一份 #heroEmptyState。
 * 现在收成这一个函式，用 level 参数分流成两种呈现：
 *   - 'block'（预设）：小图示圆圈 + 标题 + 说明 + 可选的 CTA 按钮，用於既有
 *     页面/卡片裡的一小块（列表还没有资料、Modal 内容是空的……）
 *   - 'page'：搭伙鸭品牌插画 + 品牌 slogan（固定文案，不受 title 参数影响）+
 *     说明 + 可选的 CTA 按钮，用於整个分页/整张卡片被换成引导画面的情境——
 *     目前只有「完全没有任何旅程」这一种场景在用，标语是「聚会分账，鸭力全无！」，
 *     这句话不因为呼叫端传了什麼 title 而改变，所以 level='page' 时 title
 *     参数会被忽略，只有 message／modalId／buttonLabel 有作用
 * 两种呈现共用同一套 CSS（.empty-state／.page-empty-hero 系列既有的样式，
 * 没有为了合併另外新增）
 * @param {string} containerId 要渲染进去的容器 id
 * @param {string} title 标题；level='page' 时会被忽略（固定用品牌 slogan）
 * @param {string} message 说明文字
 * @param {string} [modalId] 有給的話会渲染一颗打开该 Modal 的按钮
 * @param {string} [buttonLabel]
 * @param {'block'|'page'} [level='block']
 */
function renderEmptyBlock(containerId, title, message, modalId, buttonLabel, level) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  if (level === 'page') {
    container.innerHTML = `
      <span class="page-empty-hero-mark" aria-hidden="true">${buildEmptyStateBrandMarkSvg_(containerId)}</span>
      <p class="page-empty-hero-slogan">${escapeHtml(t('brand.slogan'))}</p>
      <p class="page-empty-hero-desc">${escapeHtml(message)}</p>
      ${modalId ? `<button class="btn btn-primary page-empty-hero-btn" type="button" data-open-modal="${modalId}">${escapeHtml(buttonLabel || '')}</button>` : ''}
    `;
    return;
  }

  container.innerHTML = `
    <div class="empty-state empty-state-compact">
      <div class="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none"><rect x="14" y="10" width="36" height="46" rx="6" stroke="currentColor" stroke-width="2"/><path d="M22 24H42M22 32H42M22 40H34" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${modalId ? `<button class="btn btn-primary btn-sm" type="button" data-open-modal="${modalId}">${escapeHtml(buttonLabel || '')}</button>` : ''}
    </div>
  `;
}


/* ------------------------------------------------------------
   20. 格式化 / 共用工具函式
   ------------------------------------------------------------ */

/**
 * 将一批项目依货币分组，各自加总金额与笔数
 * 排序规则：旅程的基准货币排最前面，其余货币依字母排序
 * @param {Array<Object>} items 项目阵列
 * @param {Function} amountFn 从单一项目取得金额的函式
 * @param {Function} currencyFn 从单一项目取得货币代码的函式
 * @return {Array<{currency: string, total: number, count: number}>}
 */
function groupAmountsByCurrency(items, amountFn, currencyFn) {
  const baseCurrency = (appState.tripCurrency && appState.tripCurrency.baseCurrency) || 'MYR';
  const totalsByCurrency = {};

  items.forEach((item) => {
    const currency = currencyFn(item) || baseCurrency;
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = { currency, total: 0, count: 0 };
    }
    totalsByCurrency[currency].total += Number(amountFn(item)) || 0;
    totalsByCurrency[currency].count += 1;
  });

  return Object.values(totalsByCurrency).sort((a, b) => {
    if (a.currency === baseCurrency) return -1;
    if (b.currency === baseCurrency) return 1;
    return a.currency.localeCompare(b.currency);
  });
}

/**
 * 合併「已折算成基准货币的单一数字」与「金库各币种各自加总的明细」，产出统一的
 * 按币种分组阵列——金库户口内的外币支出／收款免换算，必须保留原币种各自呈现
 * （如「MYR 1,000.00 + CNY 500.00」），不能跟基准货币的数字加在一起变成一个失真的总数；
 * 若金库币种刚好等于基准货币，则直接并入同一笔基准货币数字，不重复列一行
 * @param {string} baseCurrency 旅程基准货币
 * @param {number} baseAmount 已折算成基准货币的金额（一般消费／还款）
 * @param {Array<{currency: string, total: number}>} poolBreakdown 金库各币种明细（groupAmountsByCurrency 的回传值）
 * @return {Array<{currency: string, total: number}>} 可直接交给 formatCurrencyBreakdownText 的阵列
 */
function buildMixedCurrencyBreakdown(baseCurrency, baseAmount, poolBreakdown) {
  const totalsByCurrency = {};

  if (Math.abs(baseAmount) > AMOUNT_TOLERANCE) {
    totalsByCurrency[baseCurrency] = (totalsByCurrency[baseCurrency] || 0) + baseAmount;
  }

  (poolBreakdown || []).forEach((entry) => {
    totalsByCurrency[entry.currency] = (totalsByCurrency[entry.currency] || 0) + entry.total;
  });

  return Object.keys(totalsByCurrency)
    .filter((currency) => Math.abs(totalsByCurrency[currency]) > AMOUNT_TOLERANCE)
    .sort((a, b) => (a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b)))
    .map((currency) => ({ currency, total: totalsByCurrency[currency] }));
}

/**
 * 把「多个来源合并成一张表」的资料列（例如：拆账消费 + 金库支出份额；或已付消费 +
 * 金库预付款 + 还款）依日期由旧到新重新排序，再接回 HTML 字串——各个来源原本各自
 * 依时间排序，但直接 concat 串接後，不同来源之间的时间顺序会被打散（例如金库支出
 * 全部排在拆账消费後面），所以合并後一定要重新依日期整体排序一次，才能维持整份
 * 明细「有日期栏位的都照时间顺序」的规则
 * @param {Array<{date: string, html: string}>} rows 待排序的资料列
 * @return {string} 排序後串接好的 HTML 字串
 */
function joinRowsSortedByDate(rows) {
  return [...rows]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((row) => row.html)
    .join('');
}

function formatMoney(amount, currency) {
  const symbol = currency || (appState.tripCurrency && appState.tripCurrency.baseCurrency) || DEFAULT_CURRENCY_SYMBOL;
  const value = Number(amount) || 0;
  return `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 把金额格式化成「原始金额 → 换算成旅程基准货币后的金额」；
 * snapshotRate 有值的话优先用它（这笔消费自己的历史汇率快照），不是旅程「目前」的汇率，
 * 这样旅程后来调整汇率，历史消费显示的换算金额也不会跟着变动；没带或无效就 fallback
 * 用旅程目前的汇率（旧资料、或还没有快照概念时的呼叫方式都会走这条路，行为不变）
 * @param {Number} amount 原始金额
 * @param {String} currency 原始货币代码
 * @param {Number} [snapshotRate] 这笔消费自己的历史汇率快照（expense.ExchangeRateSnapshot）
 * @return {String} 格式化后的字串
 */
function formatMoneyWithConversion(amount, currency, snapshotRate) {
  const baseCurrency = appState.tripCurrency.baseCurrency || 'MYR';
  const original = formatMoney(amount, currency);

  if (!currency || currency === baseCurrency) {
    return original;
  }

  const rate = (snapshotRate !== undefined && snapshotRate !== null && !isNaN(snapshotRate) && snapshotRate > 0)
    ? snapshotRate
    : appState.tripCurrency.rates[currency];
  if (rate === undefined) {
    return original;
  }

  const converted = Math.round(amount * rate * 100) / 100;
  // 原本用「CNY 200.00 → MYR 120.92」单行箭头呈现，在窄栏位（例如 PDF 报告表格）
  // 容易被挤到换行、断在奇怪的地方；改成两行堆叠：原始金额在上，换算金额在下，
  // 各自都维持单行不换行，版面更稳定好读
  return `<span class="pr-amount-original">${escapeHtml(original)}</span><span class="pr-amount-converted">${escapeHtml(formatMoney(converted, baseCurrency))}</span>`;
}

/**
 * 显示一笔「消费」的金额（完整全额，不是拆账后的份额）——依 SplitType 自动判断要不要换算：
 * 金库支出（SplitType='pool'）一律免换算，只显示原始币值；一般消费才照旧显示
 * 「原始 → 换算成基准货币」。任何要呈现 Expenses 资料列金额的地方都该呼叫这支，
 * 而不是直接呼叫 formatMoneyWithConversion，否则金库支出免换算的规则很容易漏掉
 * （消费列表、分类消费 Modal、消费详情 Modal、PDF 消费明细清单都属于这种情境）
 * @param {Object} expense 消费纪录物件
 * @return {string} 格式化后的金额 HTML/文字
 */
function formatExpenseAmountDisplay(expense) {
  if (expense.SplitType === 'pool') {
    return formatMoney(expense.Amount, expense.Currency);
  }
  return formatMoneyWithConversion(expense.Amount, expense.Currency, expense.ExchangeRateSnapshot);
}

function formatDateDisplay(dateString) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return dateString || '';
  }

  if (currentLang === 'en') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateForInput(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 将日期格式化为「yyyy-MM-dd HH:mm」，用于 PDF 报告上的汇出时间戳记
 * @param {Date} date 日期物件
 * @return {string} 格式化后的字串
 */
function formatDateTimeForReport(date) {
  const datePart = formatDateForInput(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hh}:${mi}`;
}

function getInitials(name) {
  if (name === POOL_EXPENSE_PAYER_SENTINEL) {
    return '🦆'; // 金库支出没有真人付款，头像圆圈直接放只鸭子，一眼看出跟一般消费不一样
  }
  return (name || '?').trim().charAt(0).toUpperCase();
}

// 後端「金库支出」类型消费的 Payer 栏位存的固定代号，跟 Code.gs 的 POOL_EXPENSE_PAYER_SENTINEL
// 保持完全一致的字串——两边各自维护常数是因为前後端是不同档案/语言，没有共用模组机制，
// 万一以後要改这个代号，两边都要一起改
const POOL_EXPENSE_PAYER_SENTINEL = '__POOL__';

/**
 * 把消费纪录的 Payer 转成实际要显示的文字：一般消费就是真人姓名原样显示；
 * 「金库支出」这种没有真人垫付的消费，Payer 存的是後端固定代号，这里转成
 * 「搭伙金库」（依语言显示），不要把原始代号字串露给使用者看
 * @param {string} payer expense.Payer 原始值
 * @return {string}
 */
function getExpensePayerDisplay(payer) {
  return payer === POOL_EXPENSE_PAYER_SENTINEL ? t('pool.expense.payerDisplayName') : payer;
}

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Promise 版的 setTimeout，给需要「等一段固定时间再继续」的过场动画用
 * （例如切换旅程/语言时先等淡出动画跑完，才真的去载入资料/重绘）
 * @param {number} ms
 * @return {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断使用者是否开启了「减少动态效果」的系统设定——过场动画（切换旅程/语言
 * 的淡出淡入）要尊重这个设定，直接跳过动画本身，不是硬把动画时间压到 0ms
 * 还是跑一次（那样反而会让 opacity 从 1 瞬间跳到 0 又跳回 1，比完全不做
 * 更突兀）。项目里 initSplashScreen() 已经有一份就地写的判断，这里抽成
 * 共用函式给新的过场动画用，不重複写一样的判断式
 * @return {boolean}
 */
function prefersReducedMotion_() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text === undefined || text === null ? '' : text);
  return div.innerHTML;
}