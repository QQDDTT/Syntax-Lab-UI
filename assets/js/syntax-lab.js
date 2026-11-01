/**
 * Syntax-Lab 双布局引擎 (Dual-Layout Engine: Apple Cinema Focus Theater + VS Code Fullscreen IDE)
 * 严格遵循用户选定的方案 C：
 *   - 非实战页面（1. 网站主页 / 2. 编程语言主页 / 3A. 语法糖学习 / 3B. 主流架构学习）：
 *     采用「苹果式焦聚剧场与沉浸探索流 (body.layout-theater)」，悬浮胶囊顶栏 + 居中宽银幕画幅，告别拥挤三栏 IDE 感；
 *   - 实战模拟页面（3C. 实战模拟 IDE）：
 *     独占切换为「VS Code 风格全屏 IDE 工作台 (body.layout-ide)」，提供左侧多菜单活动栏、大画幅可编辑代码缓冲区与底部多标签综合面板。
 */

(function () {
  "use strict";

  const DATA = window.SYNTAX_LAB_DATA;
  if (!DATA) return;

  const REAL_LANGS = DATA.languages.filter((l) => l.id !== "all");

  const state = {
    currentView: "portal", // "portal" | "lang-hub" | "sugar" | "arch" | "ide"
    activeLang: "c",
    portalSearchQuery: "",
    activeSugarId: DATA.syntacticSugars[0].id,
    activeCaseId: DATA.canonicalCases[0].id,
    activeStepIdx: 0,
    isPlaying: false,
    playSpeed: 1.0,
    playTimer: null,
    ideCodeBuffer: {},
    soundEnabled: false,
    audioCtx: null
  };

  // ================= 1. WebAudio 微晶声学状态机 (<25ms, ±2.5% Jitter) =================
  function triggerKeyclick(type) {
    if (!state.soundEnabled) return;
    try {
      if (!state.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        state.audioCtx = new AudioContextClass();
      }
      if (state.audioCtx.state === "suspended") {
        state.audioCtx.resume();
      }
      const now = state.audioCtx.currentTime;
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      const jitter = 1 + (Math.random() * 0.05 - 0.025);
      let baseFreq = 960;
      if (type === "up" || type === "confirm") baseFreq = 1380;
      if (type === "step") baseFreq = 1120;

      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55 * jitter, now + 0.018);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.048, now + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.019);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };
      osc.start(now);
      osc.stop(now + 0.02);
    } catch (_) {}
  }

  function getActiveLangObj() {
    return REAL_LANGS.find((l) => l.id === state.activeLang) || REAL_LANGS[0];
  }

  // ================= 2. 双模布局与三层路由切换中枢 =================
  function navigateToPortal() {
    stopAutoPlay();
    state.currentView = "portal";
    applyLayoutAndSyncNav();
    renderPortalLangGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToLangHub(langId) {
    stopAutoPlay();
    if (langId && langId !== "all") {
      state.activeLang = langId;
    }
    state.currentView = "lang-hub";
    syncLanguageDefaultAssets(state.activeLang);
    applyLayoutAndSyncNav();
    renderLangHub();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToFeature(featureId, langId, options) {
    stopAutoPlay();
    if (langId && langId !== "all") {
      state.activeLang = langId;
      syncLanguageDefaultAssets(langId);
    }
    if (options && options.sugarId) state.activeSugarId = options.sugarId;
    if (options && options.caseId) {
      state.activeCaseId = options.caseId;
      state.activeStepIdx = 0;
    }

    state.currentView = featureId || "sugar"; // "sugar" | "arch" | "ide"
    applyLayoutAndSyncNav();

    if (state.currentView === "sugar") {
      renderSugarXRay();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (state.currentView === "arch") {
      renderArchPage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (state.currentView === "ide") {
      renderIdeLanguageRail();
      renderIdeWorkbench(options && options.customCode ? options.customCode : null);
    }
  }

  function syncLanguageDefaultAssets(langId) {
    const matchedSugar = DATA.syntacticSugars.find((s) => s.lang === langId);
    if (matchedSugar) state.activeSugarId = matchedSugar.id;
    const matchedCase = DATA.canonicalCases.find((c) => c.lang === langId);
    if (matchedCase) {
      state.activeCaseId = matchedCase.id;
      state.activeStepIdx = 0;
    }
  }

  function applyLayoutAndSyncNav() {
    const isIdeMode = state.currentView === "ide";

    // 核心切换：仅当处于 "ide"（实战模拟）时启用 VS Code 全屏 IDE 布局，其余全部采用苹果式焦聚剧场流！
    document.body.classList.toggle("layout-ide", isIdeMode);
    document.body.classList.toggle("layout-theater", !isIdeMode);
    document.body.setAttribute("data-current-view", state.currentView);

    // 同步 URL Hash 状态 (支持页面刷新保持与深层链接分享)
    try {
      const expectedHash =
        state.currentView === "portal"
          ? "#portal"
          : `#${state.currentView}/${state.activeLang}`;
      if (window.location.hash !== expectedHash) {
        window.history.replaceState(null, "", expectedHash);
      }
    } catch (_) {}

    // 切换剧场内的 4 个 Section (portal / lang-hub / sugar / arch)
    document.querySelectorAll(".theater-section").forEach((sec) => {
      sec.classList.toggle(
        "active",
        !isIdeMode && sec.getAttribute("data-tier-view") === state.currentView
      );
    });

    renderHeaderContextNav();
    updateAmbilightAndFingerprint();
    renderBreadcrumb();
  }

  function renderHeaderContextNav() {
    const headerNav = document.getElementById("header-context-nav");
    const mobileDock = document.getElementById("mobile-bottom-dock");
    const headerBackBtn = document.getElementById("header-back-btn");
    const langObj = getActiveLangObj();

    // 修改要求 1：在网站主页 (portal) 的 Header 中不添加“语言主页”、“语法糖学习”等任何子级导航按钮，同时隐藏返回按钮
    if (state.currentView === "portal") {
      if (headerNav) {
        headerNav.innerHTML = "";
        headerNav.style.display = "none";
      }
      if (mobileDock) {
        mobileDock.innerHTML = "";
        mobileDock.style.display = "none";
      }
      if (headerBackBtn) {
        headerBackBtn.style.display = "none";
      }
      return;
    }

    // 修改要求 2：返回按钮统一放在 Header 中
    if (headerBackBtn) {
      headerBackBtn.style.display = "inline-flex";
      if (state.currentView === "lang-hub") {
        headerBackBtn.textContent = "← 返回网站主页";
        headerBackBtn.onclick = () => {
          navigateToPortal();
          triggerKeyclick("confirm");
        };
      } else {
        headerBackBtn.textContent = `← 返回 ${langObj.name} 主页`;
        headerBackBtn.onclick = () => {
          navigateToLangHub(state.activeLang);
          triggerKeyclick("confirm");
        };
      }
    }

    const navKeyMap = {
      "lang-hub": "lang-hub",
      sugar: "feature-sugar",
      arch: "feature-arch",
      ide: "feature-ide"
    };
    const activeNavKey = navKeyMap[state.currentView] || "lang-hub";

    // 当进入具体编程语言主页或子页面时，仅展示返回网站主页与当前语言的专属页面导航（不含其他语言链接）
    if (headerNav) {
      headerNav.style.display = "";
      headerNav.innerHTML = `
        <button type="button" class="mode-tab-btn" data-tier-nav="portal">
          <span>🏠 网站主页</span>
        </button>
        <button type="button" class="mode-tab-btn ${activeNavKey === "lang-hub" ? "active" : ""}" data-tier-nav="lang-hub">
          <span>🧭 ${escapeHtml(langObj.name)} 主页</span>
        </button>
        <button type="button" class="mode-tab-btn ${activeNavKey === "feature-sugar" ? "active" : ""}" data-tier-nav="feature-sugar">
          <span>🔬 语法糖学习</span>
        </button>
        <button type="button" class="mode-tab-btn ${activeNavKey === "feature-arch" ? "active" : ""}" data-tier-nav="feature-arch">
          <span>🏛️ 主流架构学习</span>
        </button>
        <button type="button" class="mode-tab-btn ide-special-tab ${activeNavKey === "feature-ide" ? "active" : ""}" data-tier-nav="feature-ide">
          <span>💻 实战模拟 (IDE)</span>
        </button>
      `;
      headerNav.querySelectorAll("[data-tier-nav]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-tier-nav");
          if (target === "portal") navigateToPortal();
          else if (target === "lang-hub") navigateToLangHub(state.activeLang);
          else if (target === "feature-sugar") navigateToFeature("sugar", state.activeLang);
          else if (target === "feature-arch") navigateToFeature("arch", state.activeLang);
          else if (target === "feature-ide") navigateToFeature("ide", state.activeLang);
          triggerKeyclick("confirm");
        });
      });
    }

    if (mobileDock) {
      mobileDock.style.display = "";
      mobileDock.innerHTML = `
        <button type="button" class="dock-nav-btn" data-tier-nav="portal">
          <span>🏠</span>
          <span>网站主页</span>
        </button>
        <button type="button" class="dock-nav-btn ${activeNavKey === "lang-hub" ? "active" : ""}" data-tier-nav="lang-hub">
          <span>🧭</span>
          <span>${escapeHtml(langObj.name)}主页</span>
        </button>
        <button type="button" class="dock-nav-btn ${activeNavKey === "feature-sugar" ? "active" : ""}" data-tier-nav="feature-sugar">
          <span>🔬</span>
          <span>语法糖</span>
        </button>
        <button type="button" class="dock-nav-btn ${activeNavKey === "feature-arch" ? "active" : ""}" data-tier-nav="feature-arch">
          <span>🏛️</span>
          <span>主流架构</span>
        </button>
        <button type="button" class="dock-nav-btn ${activeNavKey === "feature-ide" ? "active" : ""}" data-tier-nav="feature-ide">
          <span>💻</span>
          <span>IDE实战</span>
        </button>
      `;
      mobileDock.querySelectorAll("[data-tier-nav]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-tier-nav");
          if (target === "portal") navigateToPortal();
          else if (target === "lang-hub") navigateToLangHub(state.activeLang);
          else if (target === "feature-sugar") navigateToFeature("sugar", state.activeLang);
          else if (target === "feature-arch") navigateToFeature("arch", state.activeLang);
          else if (target === "feature-ide") navigateToFeature("ide", state.activeLang);
          triggerKeyclick("confirm");
        });
      });
    }
  }

  function renderBreadcrumb() {
    const crumbEl = document.getElementById("tier-breadcrumb");
    if (!crumbEl) return;

    // 网站主页不显示子级面包屑
    if (state.currentView === "portal") {
      crumbEl.innerHTML = "";
      crumbEl.style.display = "none";
      return;
    }

    crumbEl.style.display = "flex";
    const langObj = getActiveLangObj();
    const viewLabels = {
      sugar: "🔬 3A. 语法糖剧场",
      arch: "🏛️ 3B. 主流架构剧场",
      ide: "💻 3C. 实战模拟 (全屏IDE)"
    };

    let html = `<button type="button" class="crumb-btn" data-crumb="portal">🏠 网站主页</button>`;
    html += `<span class="crumb-sep">/</span>`;
    html += `<button type="button" class="crumb-btn ${state.currentView === "lang-hub" ? "active" : ""}" data-crumb="lang-hub">🧭 ${escapeHtml(langObj.name)} 主页</button>`;

    if (viewLabels[state.currentView]) {
      html += `<span class="crumb-sep">/</span>`;
      html += `<span class="crumb-btn active">${viewLabels[state.currentView]}</span>`;
    }

    crumbEl.innerHTML = html;

    crumbEl.querySelectorAll("[data-crumb]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-crumb");
        if (target === "portal") navigateToPortal();
        else if (target === "lang-hub") navigateToLangHub(state.activeLang);
        triggerKeyclick("confirm");
      });
    });
  }

  function updateAmbilightAndFingerprint() {
    const langObj = getActiveLangObj();

    const ambilight = document.getElementById("ambilight-spill");
    if (ambilight) {
      ambilight.style.setProperty("--active-lang-glow", langObj.glow);
    }

    const fpName = document.getElementById("fp-lang-name");
    const fpMem = document.getElementById("fp-mem-val");
    const fpConc = document.getElementById("fp-conc-val");
    const fpType = document.getElementById("fp-type-val");
    const fpFw = document.getElementById("fp-fw-val");

    if (fpName) fpName.textContent = `${langObj.name} · ${langObj.shortTag}`;
    if (fpMem) fpMem.textContent = langObj.memoryModel;
    if (fpConc) fpConc.textContent = langObj.concurrency;
    if (fpType) fpType.textContent = langObj.typeSystem;
    if (fpFw) fpFw.textContent = langObj.frameworks.slice(0, 3).join(" / ");

    const promptEl = document.getElementById("term-prompt-label");
    if (promptEl) {
      promptEl.textContent = `syntax@${langObj.id}:~$`;
    }
  }

  // ================= 3. 层级 1：渲染网站主页 (苹果焦聚剧场画廊) =================
  function renderPortalLangGrid() {
    const grid = document.getElementById("portal-lang-grid");
    const countBadge = document.getElementById("portal-count-badge");
    if (!grid) return;

    const q = state.portalSearchQuery.trim().toLowerCase();
    const filtered = REAL_LANGS.filter((l) => {
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.shortTag.toLowerCase().includes(q) ||
        (l.tagline && l.tagline.toLowerCase().includes(q)) ||
        (l.intro && l.intro.toLowerCase().includes(q)) ||
        l.memoryModel.toLowerCase().includes(q) ||
        l.concurrency.toLowerCase().includes(q) ||
        l.frameworks.some((fw) => fw.toLowerCase().includes(q))
      );
    });

    if (countBadge) {
      countBadge.textContent = `共 ${filtered.length} / 9 大编程语言学习模块`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="manifest-card">
          <div class="card-title">未匹配到对应编程语言或框架模块</div>
          <div class="card-desc">请清除搜索框关键字以浏览全部九大主流编程语言学习模块。</div>
        </div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((l) => {
        const sugarCount = DATA.syntacticSugars.filter((s) => s.lang === l.id).length;
        const topicCount = DATA.manifestItems.filter((m) => m.lang === l.id).length;
        return `
        <article class="lang-module-card tilt-card" style="--lang-color: ${l.color}">
          <div class="lm-card-header">
            <div class="lm-title-cluster">
              <span class="lang-dot" style="--lang-color: ${l.color}"></span>
              <h3 class="lm-lang-name">${escapeHtml(l.name)}</h3>
            </div>
            <span class="card-lang-badge">${escapeHtml(l.shortTag)}</span>
          </div>

          <p class="lm-tagline">${escapeHtml(l.tagline || "")}</p>

          <div class="lm-specs-box">
            <div class="lm-spec-line">
              <span class="lm-spec-k">内存机制</span>
              <span class="lm-spec-v">${escapeHtml(l.memoryModel)}</span>
            </div>
            <div class="lm-spec-line">
              <span class="lm-spec-k">并发原语</span>
              <span class="lm-spec-v">${escapeHtml(l.concurrency)}</span>
            </div>
          </div>

          <div class="card-framework-pills">
            ${l.frameworks.map((fw) => `<span class="fw-pill">${escapeHtml(fw)}</span>`).join("")}
          </div>

          <div class="lm-card-footer">
            <button type="button" class="lm-primary-hub-btn js-open-lang-hub" data-lang="${l.id}">
              <span>🧭 进入 ${escapeHtml(l.name)} 主页 (${topicCount} 专题 / ${sugarCount} 脱糖)</span>
              <span>→</span>
            </button>
            <div class="lm-quick-features">
              <button type="button" class="card-action-btn js-quick-feature" data-lang="${l.id}" data-feature="sugar">
                🔬 语法糖剧场
              </button>
              <button type="button" class="card-action-btn js-quick-feature" data-lang="${l.id}" data-feature="arch">
                🏛️ 架构剧场
              </button>
              <button type="button" class="card-action-btn js-quick-feature" data-lang="${l.id}" data-feature="ide">
                💻 全屏 IDE
              </button>
            </div>
          </div>
        </article>`;
      })
      .join("");

    grid.querySelectorAll(".js-open-lang-hub").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigateToLangHub(btn.getAttribute("data-lang"));
        triggerKeyclick("confirm");
      });
    });

    grid.querySelectorAll(".js-quick-feature").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigateToFeature(
          btn.getAttribute("data-feature"),
          btn.getAttribute("data-lang")
        );
        triggerKeyclick("confirm");
      });
    });

    bind3DTiltCards();
  }

  // ================= 4. 层级 2：渲染编程语言主页 (Apple Keynote & Bento Grid) =================
  function renderLangHub() {
    const langObj = getActiveLangObj();

    const tagBadge = document.getElementById("hub-lang-tag-badge");
    const creatorEl = document.getElementById("hub-creator-text");
    const titleEl = document.getElementById("hub-lang-title");
    const taglineEl = document.getElementById("hub-lang-tagline");
    const cmdEl = document.getElementById("hub-toolchain-cmd");
    const introEl = document.getElementById("hub-lang-intro");

    const dnaMem = document.getElementById("hub-dna-mem");
    const dnaConc = document.getElementById("hub-dna-conc");
    const dnaType = document.getElementById("hub-dna-type");
    const dnaFw = document.getElementById("hub-dna-fw");

    if (tagBadge) tagBadge.textContent = `${langObj.name} · ${langObj.shortTag}`;
    if (creatorEl) creatorEl.textContent = langObj.creator || langObj.shortTag;
    if (titleEl) titleEl.textContent = `${langObj.name} 编程语言与架构剧场`;
    if (taglineEl) taglineEl.textContent = langObj.tagline || "";
    if (cmdEl) cmdEl.textContent = langObj.toolchainCmd;
    if (introEl) introEl.textContent = langObj.intro || "";

    if (dnaMem) dnaMem.textContent = langObj.memoryModel;
    if (dnaConc) dnaConc.textContent = langObj.concurrency;
    if (dnaType) dnaType.textContent = langObj.typeSystem;
    if (dnaFw) dnaFw.textContent = langObj.frameworks.join(" · ");

    const langSugars = DATA.syntacticSugars.filter((s) => s.lang === langObj.id);
    const langCases = DATA.canonicalCases.filter((c) => c.lang === langObj.id);
    const sugarPreview = document.getElementById("hub-sugar-preview");
    const archPreview = document.getElementById("hub-arch-preview");
    const idePreview = document.getElementById("hub-ide-preview");

    if (sugarPreview && langSugars.length > 0) {
      sugarPreview.textContent = `宽银幕双透镜对照 ${langObj.name} 语法糖（${langSugars.map((s) => s.title.split("->")[0].trim()).join("；")}）与编译器 AST Lowering 底层状态机。`;
    }
    if (archPreview) {
      const caseTitle = langCases[0] ? langCases[0].title : `${langObj.name} 核心框架管线`;
      archPreview.textContent = `系统拆解 ${langObj.frameworks.join(" / ")} 内部架构，并在宽银幕双联剧场中逐帧回放「${caseTitle}」栈堆内存流转。`;
    }
    if (idePreview) {
      idePreview.textContent = `切换至专属 VS Code 风格全屏 IDE 工作台，自由编辑 ${langObj.ideFileName || "main"} 源代码，实时运行仿真编译、AST 脱糖检视与底部堆栈示波。`;
    }

    const grid = document.getElementById("hub-manifest-grid");
    const docsCount = document.getElementById("hub-docs-count");
    const items = DATA.manifestItems.filter((m) => m.lang === langObj.id);

    if (docsCount) {
      docsCount.textContent = `当前语言共收录 ${items.length} 个核心架构专题`;
    }

    if (grid) {
      grid.innerHTML = items
        .map(
          (item) => `
        <article class="manifest-card tilt-card">
          <div class="card-top-meta">
            <span class="card-lang-badge">${escapeHtml(item.langLabel)}</span>
            <span class="card-category-tag">${escapeHtml(item.category)}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-desc">${escapeHtml(item.desc)}</p>
          <div class="card-framework-pills">
            ${item.frameworks.map((fw) => `<span class="fw-pill">${escapeHtml(fw)}</span>`).join("")}
          </div>
          <div class="card-actions-row">
            <button type="button" class="card-action-btn js-hub-jump-sugar" data-sugar="${item.sugarId}">
              <span>🔬 语法糖剧场</span>
            </button>
            <button type="button" class="card-action-btn js-hub-jump-arch" data-case="${item.caseId}">
              <span>🏛️ 主流架构剧场</span>
            </button>
            <button type="button" class="card-action-btn js-hub-jump-ide" data-case="${item.caseId}" data-doc="${escapeHtml(item.docPath)}" data-title="${escapeHtml(item.title)}">
              <span>💻 启动全屏 IDE</span>
            </button>
          </div>
        </article>`
        )
        .join("");

      grid.querySelectorAll(".js-hub-jump-sugar").forEach((btn) => {
        btn.addEventListener("click", () => {
          navigateToFeature("sugar", langObj.id, {
            sugarId: btn.getAttribute("data-sugar")
          });
          triggerKeyclick("confirm");
        });
      });

      grid.querySelectorAll(".js-hub-jump-arch").forEach((btn) => {
        btn.addEventListener("click", () => {
          navigateToFeature("arch", langObj.id, {
            caseId: btn.getAttribute("data-case")
          });
          triggerKeyclick("confirm");
        });
      });

      grid.querySelectorAll(".js-hub-jump-ide").forEach((btn) => {
        btn.addEventListener("click", () => {
          const doc = btn.getAttribute("data-doc");
          const title = btn.getAttribute("data-title");
          const caseId = btn.getAttribute("data-case");
          const matchedCase =
            DATA.canonicalCases.find((c) => c.id === caseId) ||
            DATA.canonicalCases.find((c) => c.lang === langObj.id);
          const customCode = matchedCase
            ? `// [项目专题: ${title}]\n// 权威精析: ${doc || ""}\n\n${matchedCase.codeLines.join("\n")}`
            : null;
          navigateToFeature("ide", langObj.id, { customCode });
          if (doc) {
            appendTermLine(`[DOC ARCHIVE] 专题: ${title}`, "out-sugar");
            appendTermLine(`  └─ 权威精析路径: ${doc}`, "out-ok");
          }
          triggerKeyclick("confirm");
        });
      });
    }

    bind3DTiltCards();
  }

  // ================= 5. 层级 3A：语法糖学习 (宽银幕双透镜 X 光剧场，仅展示当前编程语言) =================
  function renderSugarXRay() {
    const langObj = getActiveLangObj();
    const bannerTitle = document.getElementById("sugar-banner-title");
    const bar = document.getElementById("sugar-selector-bar");
    const sugarCodeEl = document.getElementById("xray-sugar-code");
    const desugarCodeEl = document.getElementById("xray-desugared-code");
    const titleEl = document.getElementById("xray-topic-title");
    const insightEl = document.getElementById("xray-insight-text");
    if (!bar || !sugarCodeEl || !desugarCodeEl) return;

    if (bannerTitle) {
      bannerTitle.textContent = `🔬 ${langObj.name} 语法糖 X 光脱糖解构剧场`;
    }

    // 修改要求 2：仅保留当前编程语言的语法糖课题，不添加其他编程语言的链接或按钮
    const langSugars = DATA.syntacticSugars.filter(
      (s) => s.lang === state.activeLang
    );

    const current =
      langSugars.find((s) => s.id === state.activeSugarId) ||
      langSugars[0] ||
      DATA.syntacticSugars[0];

    state.activeSugarId = current.id;

    bar.innerHTML = langSugars
      .map((s) => {
        const active = s.id === current.id ? "active" : "";
        return `
        <button type="button" class="sugar-topic-btn ${active}" data-sugar-id="${s.id}">
          <span>[${escapeHtml(s.langName)}]</span>
          <span>${escapeHtml(s.title.split("->")[0].trim())}</span>
        </button>`;
      })
      .join("");

    bar.querySelectorAll(".sugar-topic-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeSugarId = btn.getAttribute("data-sugar-id");
        renderSugarXRay();
        triggerKeyclick("step");
      });
    });

    if (titleEl) titleEl.textContent = current.title;
    sugarCodeEl.textContent = current.sugarCode;
    desugarCodeEl.textContent = current.desugaredCode;
    if (insightEl) insightEl.textContent = current.insight;
  }

  // ================= 6. 层级 3B：主流架构学习 (宽银幕双联时间旅行剧场，仅展示当前编程语言) =================
  function renderArchPage() {
    const langObj = getActiveLangObj();
    const bannerTitle = document.getElementById("arch-banner-title");
    const fwCardsContainer = document.getElementById("arch-framework-cards");
    const archFpMem = document.getElementById("arch-fp-mem");
    const archFpConc = document.getElementById("arch-fp-conc");
    const archFpFw = document.getElementById("arch-fp-fw");

    if (bannerTitle) {
      bannerTitle.textContent = `🏛️ ${langObj.name} 主流架构与时间旅行步进剧场 (${langObj.frameworks.slice(0, 3).join(" / ")})`;
    }
    if (archFpMem) archFpMem.textContent = langObj.memoryModel;
    if (archFpConc) archFpConc.textContent = langObj.concurrency;
    if (archFpFw) archFpFw.textContent = langObj.frameworks.join(" · ");

    if (fwCardsContainer) {
      const langTopics = DATA.manifestItems.filter((m) => m.lang === state.activeLang);
      fwCardsContainer.innerHTML = langTopics
        .map(
          (item) => `
        <article class="manifest-card">
          <div class="card-top-meta">
            <span class="card-lang-badge">${escapeHtml(item.langLabel)}</span>
            <span class="card-category-tag">${escapeHtml(item.category)}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-desc">${escapeHtml(item.desc)}</p>
          <div class="card-framework-pills">
            ${item.frameworks.map((fw) => `<span class="fw-pill">${escapeHtml(fw)}</span>`).join("")}
          </div>
        </article>`
        )
        .join("");
    }

    renderCanonicalCase();
  }

  function renderCanonicalCase() {
    const selectorRow = document.getElementById("case-selector-row");
    const codeBox = document.getElementById("case-code-lines");
    const stepBadge = document.getElementById("step-badge-counter");
    const slider = document.getElementById("step-slider");
    const narrativeEl = document.getElementById("arch-narrative-text");
    const phaseBadge = document.getElementById("arch-phase-badge");

    // 修改要求 2：仅保留当前编程语言的架构步进案例，不添加其他编程语言的案例链接
    const langCases = DATA.canonicalCases.filter(
      (c) => c.lang === state.activeLang
    );

    const currentCase =
      langCases.find((c) => c.id === state.activeCaseId) ||
      langCases[0] ||
      DATA.canonicalCases[0];

    state.activeCaseId = currentCase.id;

    if (selectorRow) {
      selectorRow.innerHTML = langCases
        .map((c) => {
          const active = c.id === currentCase.id ? "active" : "";
          return `
          <button type="button" class="sugar-topic-btn ${active}" data-case-id="${c.id}">
            <span>${escapeHtml(c.title)}</span>
          </button>`;
        })
        .join("");

      selectorRow.querySelectorAll(".sugar-topic-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          stopAutoPlay();
          state.activeCaseId = btn.getAttribute("data-case-id");
          state.activeStepIdx = 0;
          renderArchPage();
          triggerKeyclick("confirm");
        });
      });
    }

    const totalSteps = currentCase.steps.length;
    if (state.activeStepIdx >= totalSteps) state.activeStepIdx = totalSteps - 1;
    if (state.activeStepIdx < 0) state.activeStepIdx = 0;

    const stepObj = currentCase.steps[state.activeStepIdx];

    if (codeBox) {
      codeBox.innerHTML = currentCase.codeLines
        .map((line, idx) => {
          const ln = idx + 1;
          const isActive = ln === stepObj.activeLine ? "active-line" : "";
          return `<div class="trace-line ${isActive}"><span class="trace-ln">${ln}</span><span>${escapeHtml(line)}</span></div>`;
        })
        .join("");
    }

    if (stepBadge) {
      stepBadge.textContent = `STEP ${state.activeStepIdx + 1} / ${totalSteps}`;
    }
    if (slider) {
      slider.max = String(totalSteps - 1);
      slider.value = String(state.activeStepIdx);
    }
    if (narrativeEl) {
      narrativeEl.textContent = stepObj.narrative;
    }
    if (phaseBadge) {
      phaseBadge.textContent = stepObj.phase;
    }

    renderOscilloscopeSVG("arch-oscilloscope-svg", stepObj);
  }

  // 通用 SVG 栈堆示波器绘制函数 (支持剧场内嵌 arch-oscilloscope-svg 与全屏 IDE ide-oscilloscope-svg)
  function renderOscilloscopeSVG(targetSvgId, stepObj) {
    const svgEl = document.getElementById(targetSvgId);
    if (!svgEl) return;

    const stackFrames = stepObj.stack || [];
    const heapNodes = stepObj.heap || [];

    let svgContent = `
      <defs>
        <marker id="ptr-arrow-${targetSvgId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"></path>
        </marker>
      </defs>
      <rect x="0" y="0" width="440" height="260" fill="#070a10"></rect>
      <line x1="212" y1="12" x2="212" y2="248" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4"></line>
      <text x="12" y="22" fill="#38bdf8" font-size="10" font-family="monospace" font-weight="bold">CALL STACK (RSP)</text>
      <text x="224" y="22" fill="#f59e0b" font-size="10" font-family="monospace" font-weight="bold">HEAP / RUNTIME TOPOLOGY</text>
    `;

    stackFrames.forEach((sf, i) => {
      const y = 34 + i * 96;
      svgContent += `
        <rect x="8" y="${y}" width="196" height="86" rx="6" fill="rgba(56, 189, 248, 0.08)" stroke="#38bdf8" stroke-width="1.2"></rect>
        <text x="15" y="${y + 18}" fill="#e0f2fe" font-size="9.5" font-family="monospace" font-weight="bold">${escapeHtml(sf.frame)}</text>
      `;
      (sf.vars || []).slice(0, 3).forEach((v, vi) => {
        svgContent += `
          <text x="15" y="${y + 38 + vi * 16}" fill="#93c5fd" font-size="8.6" font-family="monospace">${escapeHtml(v)}</text>
        `;
      });
    });

    if (heapNodes.length === 0) {
      svgContent += `
        <rect x="222" y="68" width="208" height="60" rx="6" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" stroke-dasharray="3 3"></rect>
        <text x="242" y="102" fill="#6b7280" font-size="10" font-family="monospace">0 Heap Allocations (Zero-GC)</text>
      `;
    } else {
      heapNodes.forEach((hn, hi) => {
        const y = 34 + hi * 98;
        const strokeColor = hn.color || "#f59e0b";
        svgContent += `
          <rect x="222" y="${y}" width="210" height="88" rx="6" fill="rgba(245, 158, 11, 0.07)" stroke="${strokeColor}" stroke-width="1.4"></rect>
          <text x="230" y="${y + 18}" fill="${strokeColor}" font-size="9.4" font-family="monospace" font-weight="bold">${escapeHtml(hn.title)}</text>
        `;
        (hn.fields || []).slice(0, 3).forEach((f, fi) => {
          svgContent += `
            <text x="230" y="${y + 38 + fi * 16}" fill="#e5e7eb" font-size="8.6" font-family="monospace">${escapeHtml(f)}</text>
          `;
        });
        svgContent += `
          <path d="M 204 ${74 + hi * 30} C 212 ${74 + hi * 30}, 214 ${y + 36}, 220 ${y + 36}"
                fill="none" stroke="#38bdf8" stroke-width="1.5" marker-end="url(#ptr-arrow-${targetSvgId})"></path>
        `;
      });
    }

    svgEl.innerHTML = svgContent;
  }

  function stepDelta(delta) {
    const currentCase =
      DATA.canonicalCases.find((c) => c.id === state.activeCaseId) ||
      DATA.canonicalCases[0];
    const nextIdx =
      (state.activeStepIdx + delta + currentCase.steps.length) %
      currentCase.steps.length;
    state.activeStepIdx = nextIdx;
    renderCanonicalCase();
    triggerKeyclick("step");
  }

  function startAutoPlayTimer() {
    if (state.playTimer) clearInterval(state.playTimer);
    const intervalMs = Math.max(250, Math.round(1800 / (state.playSpeed || 1)));
    state.playTimer = setInterval(() => {
      stepDelta(1);
    }, intervalMs);
  }

  function toggleAutoPlay() {
    if (state.isPlaying) {
      stopAutoPlay();
    } else {
      state.isPlaying = true;
      updatePlayBtnLabel();
      startAutoPlayTimer();
    }
    triggerKeyclick("confirm");
  }

  function stopAutoPlay() {
    state.isPlaying = false;
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
    }
    updatePlayBtnLabel();
  }

  function updatePlayBtnLabel() {
    const playBtn = document.getElementById("btn-step-play");
    if (playBtn) {
      playBtn.innerHTML = state.isPlaying ? "⏸ 暂停步进" : "▶ 自动演练";
    }
  }

  // ================= 7. 层级 3C：VS Code 风格精简全屏 IDE 实战模拟工作台 =================
  function switchIdeBottomTab(tabId) {
    const bottomDock = document.getElementById("vscode-bottom-dock");
    const toggleBtn = document.getElementById("btn-toggle-bottom-dock");
    if (bottomDock && bottomDock.classList.contains("collapsed")) {
      bottomDock.classList.remove("collapsed");
      if (toggleBtn) toggleBtn.textContent = "▾ 折叠面板";
    }

    document.querySelectorAll("[data-bottom-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-bottom-tab") === tabId);
    });
    document.querySelectorAll("[data-bottom-pane]").forEach((pane) => {
      pane.classList.toggle("active", pane.getAttribute("data-bottom-pane") === tabId);
    });
  }

  function renderIdeLanguageRail(activeTpl) {
    const container = document.getElementById("ide-lang-channel-list");
    const explorerTag = document.getElementById("ide-explorer-lang-tag");
    const projectList = document.getElementById("ide-project-manifest-list");
    const sideCmd = document.getElementById("ide-side-toolchain-cmd");
    if (!container) return;

    const langObj = getActiveLangObj();
    if (explorerTag) {
      explorerTag.textContent = `${langObj.name} (${langObj.shortTag})`;
    }
    if (sideCmd) {
      sideCmd.textContent = langObj.toolchainCmd;
    }

    const baseFile = langObj.ideFileName || `main.${langObj.id}`;
    const ext = baseFile.includes(".") ? baseFile.split(".").pop() : langObj.id;
    const currentTpl = activeTpl || "starter";

    const projectFiles = [
      { id: "starter", name: baseFile, tag: "主程序模板" },
      { id: "sugar", name: `sugar_ast.${ext}`, tag: "高层语法糖" },
      { id: "desugared", name: `lowered_ir.${ext}`, tag: "AST 脱糖底层" },
      { id: "case", name: `arch_trace.${ext}`, tag: "主流架构步进" }
    ];

    container.innerHTML = projectFiles
      .map((f) => {
        const isActive = f.id === currentTpl ? "active" : "";
        return `
        <button type="button" class="lang-channel-btn ${isActive}"
                data-ide-tpl="${f.id}"
                data-ide-filename="${escapeHtml(f.name)}"
                style="--lang-color: ${langObj.color}">
          <span class="lang-btn-left">
            <span class="lang-dot" style="--lang-color: ${langObj.color}"></span>
            <span class="lang-btn-name">${escapeHtml(f.name)}</span>
          </span>
          <span class="lang-btn-tag">${escapeHtml(f.tag)}</span>
        </button>`;
      })
      .join("");

    container.querySelectorAll("[data-ide-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tplMode = btn.getAttribute("data-ide-tpl");
        const fn = btn.getAttribute("data-ide-filename");
        const fileLabel = document.getElementById("ide-filename-label");
        if (fileLabel && fn) fileLabel.textContent = fn;
        const tplSelect = document.getElementById("ide-template-select");
        if (tplSelect) {
          tplSelect.value = tplMode;
          tplSelect.dispatchEvent(new Event("change"));
        }
        renderIdeLanguageRail(tplMode);
        triggerKeyclick("step");
      });
    });

    // 渲染 VS Code 左侧菜单 2：项目清单 (当前语言的架构与框架项目模块)
    if (projectList) {
      const langItems = DATA.manifestItems.filter((m) => m.lang === langObj.id);
      projectList.innerHTML = langItems
        .map(
          (item, idx) => `
          <button type="button" class="vscode-proj-item" data-proj-idx="${idx}">
            <span class="vscode-proj-cat">${escapeHtml(item.category)}</span>
            <span class="vscode-proj-title">${escapeHtml(item.title)}</span>
          </button>`
        )
        .join("");

      projectList.querySelectorAll("[data-proj-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-proj-idx"), 10) || 0;
          const item = langItems[idx];
          if (!item) return;
          const matchedCase =
            DATA.canonicalCases.find((c) => c.id === item.caseId) ||
            DATA.canonicalCases.find((c) => c.lang === langObj.id) ||
            DATA.canonicalCases[0];
          const textarea = document.getElementById("ide-code-textarea");
          if (textarea && matchedCase) {
            textarea.value = `// [项目专题: ${item.title}]\n// 关联框架: ${item.frameworks.join(" / ")}\n\n${matchedCase.codeLines.join("\n")}`;
            state.ideCodeBuffer[langObj.id] = textarea.value;
            syncIdeLineGutter();
          }
          appendTermLine(`[PROJECT LOADED] 已载入项目模块: ${item.title}`, "out-sugar");
          triggerKeyclick("confirm");
        });
      });
    }
  }

  function renderIdeWorkbench(overrideCode) {
    const langObj = getActiveLangObj();
    const fileLabel = document.getElementById("ide-filename-label");
    const fileDot = document.getElementById("ide-file-dot");
    const statusLang = document.getElementById("ide-status-lang");
    const statusBadge = document.getElementById("ide-status-badge");
    const textarea = document.getElementById("ide-code-textarea");
    const tplSelect = document.getElementById("ide-template-select");

    if (fileLabel) fileLabel.textContent = langObj.ideFileName || `main.${langObj.id}`;
    if (fileDot) fileDot.style.background = langObj.color;
    if (statusLang) statusLang.textContent = `${langObj.name} (${langObj.shortTag}) · ${langObj.toolchainCmd}`;
    if (statusBadge) statusBadge.textContent = `READY · ${langObj.shortTag}`;
    if (tplSelect) tplSelect.value = "starter";

    if (textarea) {
      if (overrideCode) {
        state.ideCodeBuffer[langObj.id] = overrideCode;
      } else if (!state.ideCodeBuffer[langObj.id]) {
        state.ideCodeBuffer[langObj.id] = langObj.ideStarterCode || "";
      }
      textarea.value = state.ideCodeBuffer[langObj.id];
      syncIdeLineGutter();
    }

    // 同步底部面板「堆栈内存示波器」与「AST 脱糖对照」为当前编程语言状态
    const defaultCase =
      DATA.canonicalCases.find((c) => c.lang === langObj.id) ||
      DATA.canonicalCases[0];
    if (defaultCase && defaultCase.steps[0]) {
      renderOscilloscopeSVG("ide-oscilloscope-svg", defaultCase.steps[0]);
      const phaseBadge = document.getElementById("ide-phase-badge");
      const narrativeEl = document.getElementById("ide-narrative-text");
      if (phaseBadge) phaseBadge.textContent = `IDE_READY · ${langObj.id.toUpperCase()}`;
      if (narrativeEl) {
        narrativeEl.textContent = `【${langObj.name} 实时栈堆内存示波器就绪】${defaultCase.steps[0].narrative}`;
      }
    }

    const matchedSugar =
      DATA.syntacticSugars.find((s) => s.lang === langObj.id) ||
      DATA.syntacticSugars[0];
    if (matchedSugar) {
      const dTitle = document.getElementById("ide-bottom-desugar-title");
      const dCode = document.getElementById("ide-bottom-desugar-code");
      const dInsight = document.getElementById("ide-bottom-desugar-insight");
      if (dTitle) dTitle.textContent = `⚙️ ${matchedSugar.title}`;
      if (dCode) dCode.textContent = matchedSugar.desugaredCode;
      if (dInsight) dInsight.textContent = matchedSugar.insight;
    }
  }

  function syncIdeLineGutter() {
    const textarea = document.getElementById("ide-code-textarea");
    const gutter = document.getElementById("ide-line-gutter");
    if (!textarea || !gutter) return;

    const linesCount = Math.min(2000, Math.max(1, textarea.value.split("\n").length));
    const nums = [];
    for (let i = 1; i <= linesCount; i++) {
      nums.push(i);
    }
    gutter.innerHTML = nums.join("<br>");
    gutter.scrollTop = textarea.scrollTop;
  }

  function updateIdeCursorPos() {
    const textarea = document.getElementById("ide-code-textarea");
    const cursorEl = document.getElementById("ide-status-cursor");
    if (!textarea || !cursorEl) return;

    const pos = textarea.selectionStart || 0;
    const upToCursor = textarea.value.slice(0, pos).split("\n");
    const ln = upToCursor.length;
    const col = upToCursor[upToCursor.length - 1].length + 1;
    cursorEl.textContent = `Ln ${ln}, Col ${col}`;
  }

  function executeIdeCodeBuffer() {
    const langObj = getActiveLangObj();
    const textarea = document.getElementById("ide-code-textarea");
    const statusBadge = document.getElementById("ide-status-badge");
    const code = textarea ? textarea.value : "";
    state.ideCodeBuffer[langObj.id] = code;

    const lineCount = code.split("\n").length;
    const byteLen = new Blob([code]).size;

    if (statusBadge) {
      statusBadge.textContent = `RUNNING · ${lineCount} LINES (${byteLen}B)`;
    }

    appendTermLine(
      `syntax@${langObj.id}:~$ ${langObj.toolchainCmd} [${langObj.ideFileName}]`,
      "cmd-echo"
    );
    appendTermLine(
      `  [COMPILER] 正在编译执行 ${langObj.ideFileName} (${lineCount} 行, ${byteLen} Bytes)...`,
      "out-warn"
    );

    const extractedOutputs = [];
    const lines = code.split("\n");
    lines.forEach((ln, idx) => {
      const trimmed = ln.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("#")) return;
      const strMatches = trimmed.match(/["'`]([^"'`]+)["'`]/g);
      if (
        strMatches &&
        /(printf|cout|WriteLine|println|print\(|console\.log|fmt\.Print)/i.test(trimmed)
      ) {
        const cleaned = strMatches
          .map((s) => s.slice(1, -1).replace(/\\n/g, ""))
          .join(" ");
        extractedOutputs.push(`  [STDOUT L${idx + 1}] ${cleaned}`);
      }
    });

    if (extractedOutputs.length > 0) {
      extractedOutputs.forEach((outLine) => appendTermLine(outLine, "out-ok"));
    } else {
      appendTermLine(
        `  [STDOUT] [${langObj.name}] 编译与执行完成 (0 Warnings, 0 Errors)。`,
        "out-ok"
      );
    }

    const detectedVars = [];
    const varRegex = /\b(?:(?:let\s+mut|let|const|var|auto|int|long|double|float|char|bool|string|String|Span<int>|struct\s+\w+\s*\*?)\s+([a-zA-Z_][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::=|=\s*(?:malloc|torch\.|asyncio\.|new\b|\[|\{)))/g;
    let m;
    while ((m = varRegex.exec(code)) !== null && detectedVars.length < 3) {
      const varName = m[1] || m[2];
      if (varName && !["return", "if", "for", "while", "switch"].includes(varName)) {
        detectedVars.push(`local ${varName} (Line ${code.slice(0, m.index).split("\n").length})`);
      }
    }
    if (detectedVars.length === 0) {
      detectedVars.push(`file: ${langObj.ideFileName}`, `lines: ${lineCount} | bytes: ${byteLen}`);
    }

    const customStep = {
      phase: `IDE_EXEC_${langObj.id.toUpperCase()}`,
      narrative: `【IDE 实时编译仿真完毕】已解析您在 ${langObj.ideFileName} 中编写的 ${lineCount} 行 ${langObj.name} 代码（${langObj.memoryModel}），底部堆栈内存示波器已同步当前活动栈帧与运行时拓扑。`,
      stack: [
        {
          frame: `${langObj.ideFileName} :: main()`,
          vars: detectedVars
        }
      ],
      heap: [
        {
          id: "0xIDE_RUNTIME",
          title: `${langObj.name} Runtime (${langObj.shortTag})`,
          fields: [
            `Memory: ${langObj.memoryModel.slice(0, 28)}`,
            `Concurrency: ${langObj.concurrency.slice(0, 26)}`,
            `Frameworks: ${langObj.frameworks.slice(0, 3).join("/")}`
          ],
          color: langObj.color
        }
      ]
    };

    renderOscilloscopeSVG("ide-oscilloscope-svg", customStep);
    const phaseBadge = document.getElementById("ide-phase-badge");
    const narrativeEl = document.getElementById("ide-narrative-text");
    if (phaseBadge) phaseBadge.textContent = customStep.phase;
    if (narrativeEl) narrativeEl.textContent = customStep.narrative;

    if (statusBadge) {
      statusBadge.textContent = `EXIT 0 · ${lineCount} LINES EXECUTED`;
    }
    appendTermLine(
      `  └─ [EXIT 0] 执行成功! 底部堆栈内存示波器已同步更新。`,
      "out-ok"
    );
  }

  function appendTermLine(text, cls) {
    const out = document.getElementById("terminal-output");
    if (!out) return;
    const div = document.createElement("div");
    div.className = `term-line ${cls || ""}`;
    div.textContent = text;
    out.appendChild(div);
    while (out.childElementCount > 200) {
      out.removeChild(out.firstElementChild);
    }
    out.scrollTop = out.scrollHeight;
  }

  function runTerminalCommand(rawCmd) {
    const cmd = (rawCmd || "").trim();
    if (!cmd) return;

    const langObj = getActiveLangObj();
    appendTermLine(`syntax@${langObj.id}:~$ ${cmd}`, "cmd-echo");

    const parts = cmd.toLowerCase().split(/\s+/);
    const action = parts[0];

    if (action === "clear" || action === "cls") {
      const out = document.getElementById("terminal-output");
      if (out) out.innerHTML = "";
      return;
    }

    if (action === "help") {
      DATA.terminalCommands.help.forEach((l) => appendTermLine(l));
      return;
    }

    if (action === "bench") {
      DATA.terminalCommands.bench.forEach((l) => appendTermLine(l, "out-ok"));
      return;
    }

    if (action === "refs") {
      DATA.terminalCommands.refs.forEach((l) => appendTermLine(l, "out-ok"));
      return;
    }

    if (action === "reset") {
      const ideTextarea = document.getElementById("ide-code-textarea");
      if (ideTextarea) {
        ideTextarea.value = langObj.ideStarterCode || "";
        state.ideCodeBuffer[langObj.id] = ideTextarea.value;
        syncIdeLineGutter();
      }
      renderIdeLanguageRail("starter");
      appendTermLine(
        `[RESET] 已恢复 ${langObj.ideFileName} 默认模板代码。`,
        "out-warn"
      );
      return;
    }

    if (action === "run") {
      executeIdeCodeBuffer();
      return;
    }

    if (action === "desugar") {
      const matched =
        DATA.syntacticSugars.find((s) => s.lang === langObj.id) ||
        DATA.syntacticSugars[0];
      appendTermLine(`[AST DESUGAR] ${matched.title}`, "out-sugar");
      matched.desugaredCode
        .split("\n")
        .slice(0, 14)
        .forEach((line) => {
          appendTermLine(`  ${line}`);
        });
      return;
    }

    if (action === "mem") {
      appendTermLine(
        `[MEMORY DUMP] ${langObj.name} (${langObj.shortTag}) 栈帧与堆对象布局:`,
        "out-warn"
      );
      appendTermLine(`  [RSP+0x00] 0x00007FFE_88A01020  <- 当前活动栈顶指针 (${langObj.ideFileName})`);
      appendTermLine(`  [HEAP+0x0] 0x000002A0_00401008  <- ${langObj.memoryModel}`);
      appendTermLine(`  [STATUS]   Zero Dangling Pointers | Cache Line Aligned (64 Bytes)`, "out-ok");
      return;
    }

    if (action === "framework") {
      appendTermLine(
        `[FRAMEWORK INSPECTOR] ${langObj.name} 生态主流开发框架矩阵:`,
        "out-sugar"
      );
      appendTermLine(`  核心框架: ${langObj.frameworks.join("  |  ")}`, "out-ok");
      return;
    }

    appendTermLine(
      `[INFO] 已解析指令 '${cmd}'。输入 'help' 查看内置命令，或直接点击『▶ 编译并运行』。`,
      "out-warn"
    );
  }

  function bind3DTiltCards() {
    if (window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }
    document.querySelectorAll(".tilt-card").forEach((card) => {
      if (card.dataset.tiltBound === "1") return;
      card.dataset.tiltBound = "1";
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const tiltX = -((y / (rect.height / 2)) * 3.5);
        const tiltY = (x / (rect.width / 2)) * 3.5;
        card.style.transform = `perspective(1000px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function restoreFromLocationHash() {
    const raw = (window.location.hash || "").replace(/^#/, "").trim();
    if (!raw || raw === "portal") {
      navigateToPortal();
      return;
    }
    const [viewPart, langPart] = raw.split("/");
    const validLang = REAL_LANGS.find((l) => l.id === langPart)
      ? langPart
      : state.activeLang;
    if (viewPart === "lang-hub") {
      navigateToLangHub(validLang);
    } else if (["sugar", "arch", "ide"].includes(viewPart)) {
      navigateToFeature(viewPart, validLang);
    } else {
      navigateToPortal();
    }
  }

  // ================= 8. 初始化事件绑定 =================
  document.addEventListener("DOMContentLoaded", () => {
    renderLangHub();
    renderSugarXRay();
    renderArchPage();
    renderIdeLanguageRail();
    renderIdeWorkbench();
    restoreFromLocationHash();
    window.addEventListener("hashchange", restoreFromLocationHash);

    DATA.terminalCommands.help.forEach((l) => appendTermLine(l));

    document.querySelectorAll(".js-go-home").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigateToPortal();
        triggerKeyclick("confirm");
      });
    });

    document.querySelectorAll(".js-back-to-hub").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigateToLangHub(state.activeLang);
        triggerKeyclick("confirm");
      });
    });

    document.querySelectorAll("[data-tier-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-tier-nav");
        if (target === "portal") navigateToPortal();
        else if (target === "lang-hub") navigateToLangHub(state.activeLang);
        else if (target === "feature-sugar") navigateToFeature("sugar", state.activeLang);
        else if (target === "feature-arch") navigateToFeature("arch", state.activeLang);
        else if (target === "feature-ide") navigateToFeature("ide", state.activeLang);
        triggerKeyclick("confirm");
      });
    });

    document.querySelectorAll(".js-enter-feature").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateToFeature(btn.getAttribute("data-feature"), state.activeLang);
        triggerKeyclick("confirm");
      });
    });

    document.querySelectorAll("[data-open-feature]").forEach((card) => {
      card.addEventListener("click", () => {
        navigateToFeature(card.getAttribute("data-open-feature"), state.activeLang);
        triggerKeyclick("confirm");
      });
    });

    document.querySelectorAll("[data-feature-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        navigateToFeature(tab.getAttribute("data-feature-tab"), state.activeLang);
        triggerKeyclick("step");
      });
    });

    const loadSugarBtn = document.getElementById("btn-load-sugar-to-ide");
    if (loadSugarBtn) {
      loadSugarBtn.addEventListener("click", () => {
        const curSugar =
          DATA.syntacticSugars.find((s) => s.id === state.activeSugarId) ||
          DATA.syntacticSugars[0];
        navigateToFeature("ide", curSugar.lang, {
          customCode: `${curSugar.sugarCode}\n\n/* === 编译器 AST 脱糖底层实现 ===\n${curSugar.desugaredCode}\n*/`
        });
        triggerKeyclick("confirm");
      });
    }

    const loadCaseBtn = document.getElementById("btn-load-case-to-ide");
    if (loadCaseBtn) {
      loadCaseBtn.addEventListener("click", () => {
        const curCase =
          DATA.canonicalCases.find((c) => c.id === state.activeCaseId) ||
          DATA.canonicalCases[0];
        navigateToFeature("ide", curCase.lang, {
          customCode: curCase.codeLines.join("\n")
        });
        triggerKeyclick("confirm");
      });
    }

    const ideToSugarBtn = document.getElementById("btn-ide-to-sugar");
    if (ideToSugarBtn) {
      ideToSugarBtn.addEventListener("click", () => {
        navigateToFeature("sugar", state.activeLang);
        triggerKeyclick("confirm");
      });
    }
    const ideToArchBtn = document.getElementById("btn-ide-to-arch");
    if (ideToArchBtn) {
      ideToArchBtn.addEventListener("click", () => {
        navigateToFeature("arch", state.activeLang);
        triggerKeyclick("confirm");
      });
    }

    const portalSearch = document.getElementById("portal-search-input");
    if (portalSearch) {
      portalSearch.addEventListener("input", (e) => {
        state.portalSearchQuery = e.target.value || "";
        renderPortalLangGrid();
      });
    }

    const prevBtn = document.getElementById("btn-step-prev");
    const nextBtn = document.getElementById("btn-step-next");
    const playBtn = document.getElementById("btn-step-play");
    const slider = document.getElementById("step-slider");
    const speedSelect = document.getElementById("step-speed-select");

    if (prevBtn) prevBtn.addEventListener("click", () => { stopAutoPlay(); stepDelta(-1); });
    if (nextBtn) nextBtn.addEventListener("click", () => { stopAutoPlay(); stepDelta(1); });
    if (playBtn) playBtn.addEventListener("click", () => toggleAutoPlay());
    if (slider) {
      slider.addEventListener("input", (e) => {
        stopAutoPlay();
        state.activeStepIdx = parseInt(e.target.value, 10) || 0;
        renderCanonicalCase();
      });
    }
    if (speedSelect) {
      speedSelect.addEventListener("change", (e) => {
        state.playSpeed = parseFloat(e.target.value) || 1.0;
        if (state.isPlaying) startAutoPlayTimer();
        triggerKeyclick("step");
      });
    }

    const ideTextarea = document.getElementById("ide-code-textarea");
    const tplSelect = document.getElementById("ide-template-select");
    const btnIdeRun = document.getElementById("btn-ide-run");
    const btnIdeDesugar = document.getElementById("btn-ide-desugar");
    const btnIdeMem = document.getElementById("btn-ide-mem");
    const btnIdeReset = document.getElementById("btn-ide-reset");

    if (ideTextarea) {
      ideTextarea.addEventListener("input", () => {
        state.ideCodeBuffer[state.activeLang] = ideTextarea.value;
        syncIdeLineGutter();
        updateIdeCursorPos();
      });
      ideTextarea.addEventListener("scroll", () => {
        const gutter = document.getElementById("ide-line-gutter");
        if (gutter) gutter.scrollTop = ideTextarea.scrollTop;
      });
      ideTextarea.addEventListener("click", updateIdeCursorPos);
      ideTextarea.addEventListener("keyup", updateIdeCursorPos);
      ideTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const start = ideTextarea.selectionStart;
          const end = ideTextarea.selectionEnd;
          ideTextarea.value =
            ideTextarea.value.substring(0, start) +
            "    " +
            ideTextarea.value.substring(end);
          ideTextarea.selectionStart = ideTextarea.selectionEnd = start + 4;
          state.ideCodeBuffer[state.activeLang] = ideTextarea.value;
          syncIdeLineGutter();
        } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          executeIdeCodeBuffer();
          triggerKeyclick("confirm");
        }
      });
    }

    if (tplSelect && ideTextarea) {
      tplSelect.addEventListener("change", (e) => {
        const mode = e.target.value;
        const langObj = getActiveLangObj();
        const matchedSugar =
          DATA.syntacticSugars.find((s) => s.lang === langObj.id) ||
          DATA.syntacticSugars[0];
        const matchedCase =
          DATA.canonicalCases.find((c) => c.lang === langObj.id) ||
          DATA.canonicalCases[0];

        if (mode === "starter") {
          ideTextarea.value = langObj.ideStarterCode || "";
        } else if (mode === "sugar") {
          ideTextarea.value = matchedSugar.sugarCode;
        } else if (mode === "desugared") {
          ideTextarea.value = matchedSugar.desugaredCode;
        } else if (mode === "case") {
          ideTextarea.value = matchedCase.codeLines.join("\n");
        }
        state.ideCodeBuffer[langObj.id] = ideTextarea.value;
        syncIdeLineGutter();
        renderIdeLanguageRail(mode);
        triggerKeyclick("step");
      });
    }

    if (btnIdeRun) {
      btnIdeRun.addEventListener("click", () => {
        executeIdeCodeBuffer();
        switchIdeBottomTab("terminal");
        triggerKeyclick("confirm");
      });
    }
    if (btnIdeDesugar) {
      btnIdeDesugar.addEventListener("click", () => {
        runTerminalCommand("desugar");
        switchIdeBottomTab("desugar");
        triggerKeyclick("step");
      });
    }
    if (btnIdeMem) {
      btnIdeMem.addEventListener("click", () => {
        runTerminalCommand("mem");
        switchIdeBottomTab("memory");
        triggerKeyclick("step");
      });
    }
    if (btnIdeReset && ideTextarea) {
      btnIdeReset.addEventListener("click", () => {
        const langObj = getActiveLangObj();
        ideTextarea.value = langObj.ideStarterCode || "";
        state.ideCodeBuffer[langObj.id] = ideTextarea.value;
        syncIdeLineGutter();
        renderIdeLanguageRail("starter");
        appendTermLine(`[RESET] 已恢复 ${langObj.ideFileName} 默认模板代码。`, "out-warn");
        triggerKeyclick("step");
      });
    }

    // 绑定 VS Code 左侧活动栏 (Activity Bar) 菜单切换与折叠
    document.querySelectorAll("[data-vscode-side]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sideId = btn.getAttribute("data-vscode-side");
        const sidebarPanel = document.getElementById("vscode-sidebar-panel");
        const isAlreadyActive = btn.classList.contains("active");

        if (isAlreadyActive && sidebarPanel) {
          sidebarPanel.classList.toggle("collapsed");
        } else {
          if (sidebarPanel) sidebarPanel.classList.remove("collapsed");
          document.querySelectorAll("[data-vscode-side]").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-vscode-side") === sideId);
          });
          document.querySelectorAll("[data-side-pane]").forEach((pane) => {
            pane.classList.toggle("active", pane.getAttribute("data-side-pane") === sideId);
          });
        }
        triggerKeyclick("step");
      });
    });

    // 绑定 VS Code 左侧「运行与调试」面板按钮
    const sideRunBtn = document.getElementById("btn-vscode-side-run");
    const sideDesugarBtn = document.getElementById("btn-vscode-side-desugar");
    const sideMemBtn = document.getElementById("btn-vscode-side-mem");
    const sideResetBtn = document.getElementById("btn-vscode-side-reset");

    if (sideRunBtn && btnIdeRun) sideRunBtn.addEventListener("click", () => btnIdeRun.click());
    if (sideDesugarBtn && btnIdeDesugar) sideDesugarBtn.addEventListener("click", () => btnIdeDesugar.click());
    if (sideMemBtn && btnIdeMem) sideMemBtn.addEventListener("click", () => btnIdeMem.click());
    if (sideResetBtn && btnIdeReset) sideResetBtn.addEventListener("click", () => btnIdeReset.click());

    // 绑定 VS Code 底部多标签面板切换与折叠按钮
    document.querySelectorAll("[data-bottom-tab]").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        switchIdeBottomTab(tabBtn.getAttribute("data-bottom-tab"));
        triggerKeyclick("step");
      });
    });

    const toggleBottomBtn = document.getElementById("btn-toggle-bottom-dock");
    if (toggleBottomBtn) {
      toggleBottomBtn.addEventListener("click", () => {
        const bottomDock = document.getElementById("vscode-bottom-dock");
        if (!bottomDock) return;
        const isCollapsed = bottomDock.classList.toggle("collapsed");
        toggleBottomBtn.textContent = isCollapsed ? "▴ 展开面板" : "▾ 折叠面板";
        triggerKeyclick("step");
      });
    }

    const termForm = document.getElementById("terminal-form");
    const termInput = document.getElementById("terminal-input");
    if (termForm && termInput) {
      termForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = termInput.value;
        termInput.value = "";
        runTerminalCommand(val);
        triggerKeyclick("confirm");
      });
    }

    document.querySelectorAll(".js-term-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const cmd = chip.getAttribute("data-cmd");
        runTerminalCommand(cmd);
        triggerKeyclick("step");
      });
    });

    const soundBtn = document.getElementById("btn-sound-toggle");
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        state.soundEnabled = !state.soundEnabled;
        soundBtn.classList.toggle("sound-active", state.soundEnabled);
        soundBtn.innerHTML = state.soundEnabled ? "🔊 声学开" : "🔇 声学关";
        if (state.soundEnabled) triggerKeyclick("confirm");
      });
    }

    const themeBtn = document.getElementById("btn-theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("theme-gallery");
        const isGallery = document.body.classList.contains("theme-gallery");
        themeBtn.innerHTML = isGallery ? "🌙 黑曜态" : "☀️ 素白态";
        triggerKeyclick("up");
      });
    }

    window.addEventListener("keydown", (e) => {
      if (
        e.target &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT")
      ) {
        return;
      }
      if (state.currentView === "arch") {
        if (e.key === "ArrowLeft") {
          stopAutoPlay();
          stepDelta(-1);
        } else if (e.key === "ArrowRight") {
          stopAutoPlay();
          stepDelta(1);
        } else if (e.key === " ") {
          e.preventDefault();
          toggleAutoPlay();
        }
      }
    });
  });
})();
