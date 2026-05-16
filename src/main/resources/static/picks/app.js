/* 艳萍麻花 · 在线选品 - 共享逻辑（viewer + admin） */
(function () {
  const API_BASE = ''; // same-origin: 后端和页面同源时留空即可
  const ADMIN_AUTH_KEY = 'picks_admin_ok';
  const ADMIN_PASSWORD = '123456'; // 硬编码管理端密码

  function isAdminAuthed() { try { return localStorage.getItem(ADMIN_AUTH_KEY) === '1'; } catch (e) { return false; } }
  function setAdminAuthed(ok) { try { if (ok) localStorage.setItem(ADMIN_AUTH_KEY, '1'); else localStorage.removeItem(ADMIN_AUTH_KEY); } catch (e) {} }

  // ---- HTTP：简单封装 ----
  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    headers['Accept'] = 'application/json';
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('请求失败: ' + res.status);
    }
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      if (json && typeof json.code !== 'undefined' && json.code !== 0 && json.code !== 200) {
        throw new Error(json.msg || '服务返回异常');
      }
      return json && 'data' in json ? json.data : json;
    }
    return null;
  }

  // ---- 业务 API ----
  async function fetchProducts() {
    const list = await apiFetch('/api/product/list');
    return Array.isArray(list) ? list : [];
  }

  async function saveProduct(product) {
    await apiFetch('/api/product/save', { method: 'POST', body: JSON.stringify(product) });
  }

  function imageSrcOf(imageUrl) {
    if (!imageUrl) return '';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    return '/api/file/showImageByPath?path=' + encodeURIComponent(imageUrl);
  }

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('mf', file, file.name || 'photo.jpg');
    const res = await fetch(API_BASE + '/api/file/uploadFile', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) {
      const txt = await res.text().catch(function () { return ''; });
      throw new Error('上传失败: ' + res.status + ' ' + txt);
    }
    const data = await res.json();
    if (!data || !data.path) throw new Error(data && data.msg ? data.msg : '上传返回异常');
    return data.path; // 带 _temp 后缀，保存时后端会 rename
  }

  // ---- 视图：商品卡 ----
  function formatPrice(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return isFinite(n) ? '¥' + n.toFixed(2) : '';
  }

  function renderCard(product, adminMode) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = product.id;

    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';

    const img = document.createElement('img');
    img.alt = product.name || '';
    img.loading = 'lazy';
    const src = imageSrcOf(product.imageUrl);
    if (src) {
      img.src = src;
    } else {
      img.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.className = 'no-image';
      placeholder.textContent = adminMode ? '点击拍照上传' : '暂无图片';
      thumb.appendChild(placeholder);
    }
    thumb.appendChild(img);

    if (adminMode) {
      const hint = document.createElement('div');
      hint.className = 'upload-hint';
      hint.textContent = src ? '📷 点击替换图片' : '📷 点击拍照上传';
      thumb.appendChild(hint);
    }

    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'card-body';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = product.name || '未命名';
    body.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (product.boxQty && Number(product.boxQty) > 0) {
      const tag = document.createElement('span');
      tag.className = 'card-tag';
      tag.textContent = '1箱 ' + Number(product.boxQty) + ' 袋';
      meta.appendChild(tag);
    }
    if (product.shelfDays && Number(product.shelfDays) > 0) {
      const tag = document.createElement('span');
      tag.className = 'card-tag';
      tag.textContent = '保质期 ' + Number(product.shelfDays) + ' 天';
      meta.appendChild(tag);
    }
    if (meta.children.length > 0) body.appendChild(meta);

    if (product.barcode) {
      const bc = document.createElement('div');
      bc.className = 'card-barcode';
      bc.textContent = product.barcode;
      body.appendChild(bc);
    }

    const price = document.createElement('div');
    price.className = 'card-price';
    const p = formatPrice(product.salePrice);
    price.textContent = p ? '供货价 ' + p : '';
    if (p) body.appendChild(price);

    card.appendChild(body);
    return card;
  }

  // ---- 过滤 & 渲染 ----
  function filterProducts(list, keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw) return list;
    return list.filter(function (p) {
      return (p.name || '').toLowerCase().indexOf(kw) >= 0
        || (p.barcode || '').toLowerCase().indexOf(kw) >= 0
        || (p.code || '').toLowerCase().indexOf(kw) >= 0;
    });
  }

  function renderList(container, list, adminMode, onCardClick) {
    container.innerHTML = '';
    list.forEach(function (p) {
      const card = renderCard(p, adminMode);
      if (onCardClick) {
        const thumb = card.querySelector('.card-thumb');
        thumb.addEventListener('click', function () { onCardClick(p, card); });
      }
      container.appendChild(card);
    });
  }

  // ---- 轻提示 ----
  let toastTimer = null;
  function toast(msg, durationMs) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, durationMs || 2200);
  }

  // ============================================================
  // 展示页
  // ============================================================
  async function bootViewer() {
    const grid = document.getElementById('grid');
    const status = document.getElementById('status');
    const empty = document.getElementById('empty');
    const searchInput = document.getElementById('searchInput');

    let all = [];

    function rerender() {
      const list = filterProducts(all, searchInput.value);
      empty.hidden = list.length !== 0;
      renderList(grid, list, false, function (p) {
        if (p.imageUrl) openLightbox(imageSrcOf(p.imageUrl));
      });
    }

    try {
      all = await fetchProducts();
      status.textContent = '共 ' + all.length + ' 款商品';
    } catch (e) {
      status.textContent = '加载失败：' + (e.message || e);
      return;
    }

    rerender();
    searchInput.addEventListener('input', rerender);

    // lightbox
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightboxImg');

    function closeLightbox() {
      lb.hidden = true;
      lbImg.src = '';
    }

    // 用 mousedown/touchstart 双重绑定，避免有些浏览器按钮 click 不冒泡
    lb.addEventListener('click', function (e) {
      const t = e.target;
      if (!t) return;
      if (t.hasAttribute && t.hasAttribute('data-close')) {
        e.preventDefault();
        e.stopPropagation();
        closeLightbox();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lb.hidden) closeLightbox();
    });

    function openLightbox(src) {
      lbImg.src = src;
      lb.hidden = false;
    }
  }

  // ============================================================
  // 管理页
  // ============================================================
  async function bootAdmin() {
    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');
    const loginBtn = document.getElementById('loginBtn');
    const loginPass = document.getElementById('loginPass');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const searchInput = document.getElementById('searchInput');
    const grid = document.getElementById('grid');
    const status = document.getElementById('status');
    const empty = document.getElementById('empty');
    const fileInput = document.getElementById('fileInput');

    let all = [];
    let pendingProduct = null;

    function showLogin(err) {
      loginScreen.hidden = false;
      appScreen.hidden = true;
      if (err) {
        loginError.textContent = err;
        loginError.hidden = false;
      } else {
        loginError.hidden = true;
      }
    }

    async function showApp() {
      loginScreen.hidden = true;
      appScreen.hidden = false;
      await reloadProducts();
    }

    function showError(msg) {
      loginError.textContent = msg;
      loginError.hidden = false;
    }

    function doLogin() {
      const password = loginPass.value || '';
      if (!password) { showError('请输入密码'); return; }
      if (password !== ADMIN_PASSWORD) { showError('密码错误'); return; }
      setAdminAuthed(true);
      showApp();
    }

    function doLogout() {
      setAdminAuthed(false);
      if (loginPass) loginPass.value = '';
      showLogin();
    }

    function rerender() {
      const list = filterProducts(all, searchInput.value);
      empty.hidden = list.length !== 0;
      renderList(grid, list, true, function (p, cardEl) {
        pendingProduct = { product: p, card: cardEl };
        fileInput.value = '';
        fileInput.click();
      });
    }

    async function reloadProducts() {
      status.textContent = '正在加载商品...';
      try {
        all = await fetchProducts();
        status.textContent = '共 ' + all.length + ' 款商品（点击图片区域拍照上传）';
        rerender();
      } catch (e) {
        status.textContent = '加载失败：' + (e.message || e);
      }
    }

    async function handleFileChosen() {
      if (!pendingProduct) return;
      const file = fileInput.files && fileInput.files[0];
      if (!file) { pendingProduct = null; return; }
      const ctx = pendingProduct;
      pendingProduct = null;

      ctx.card.classList.add('uploading');
      try {
        const tempPath = await uploadImage(file);
        const updated = Object.assign({}, ctx.product, { imageUrl: tempPath });
        await saveProduct(updated);
        const finalPath = tempPath.replace('_temp', '');
        const idx = all.findIndex(function (p) { return p.id === ctx.product.id; });
        if (idx >= 0) {
          all[idx] = Object.assign({}, all[idx], { imageUrl: finalPath });
        }
        rerender();
        toast('已更新：' + (ctx.product.name || ''));
      } catch (e) {
        toast('上传失败：' + (e.message || e), 3500);
        ctx.card.classList.remove('uploading');
      }
    }

    // ---- 事件绑定 ----
    loginBtn.addEventListener('click', doLogin);
    loginPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    logoutBtn.addEventListener('click', doLogout);
    searchInput.addEventListener('input', rerender);
    fileInput.addEventListener('change', handleFileChosen);

    // ---- 初始化：已授权则直接进入 ----
    if (isAdminAuthed()) {
      showApp();
    } else {
      showLogin();
    }
  }

  // 导出到全局
  window.bootViewer = bootViewer;
  window.bootAdmin = bootAdmin;
})();
