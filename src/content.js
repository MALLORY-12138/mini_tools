(() => {
  if (window.__miniToolsContentLoaded) {
    return;
  }
  window.__miniToolsContentLoaded = true;

  const API_BASES = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1",
    "https://latest.currency-api.pages.dev/v1",
  ];
  const LOCAL_CURRENCY_PATH = "data/exchange-api/currencies";
  const COUNTRY_COLUMNS = [
    ["international_code", "国际代码"],
    ["country_or_region_zh", "中文地区"],
    ["english_name", "英文名称"],
    ["phone_code", "电话区号"],
  ];
  const CURRENCY_ALIASES = [
    ["人民币", "cny"],
    ["离岸人民币", "cnh"],
    ["美元", "usd"],
    ["美金", "usd"],
    ["欧元", "eur"],
    ["英镑", "gbp"],
    ["日元", "jpy"],
    ["日币", "jpy"],
    ["韩元", "krw"],
    ["韩币", "krw"],
    ["瑞士法郎", "chf"],
    ["法郎", "chf"],
    ["港币", "hkd"],
    ["港元", "hkd"],
    ["澳门币", "mop"],
    ["澳元", "aud"],
    ["澳币", "aud"],
    ["加元", "cad"],
    ["新加坡元", "sgd"],
    ["新币", "sgd"],
    ["台币", "twd"],
    ["新台币", "twd"],
    ["泰铢", "thb"],
    ["卢布", "rub"],
    ["卢比", "inr"],
    ["越南盾", "vnd"],
    ["林吉特", "myr"],
    ["马币", "myr"],
  ];

  let countryRowsPromise;
  let currenciesPromise;
  const ratesPromises = new Map();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "miniToolsPing") {
      return true;
    }

    if (message?.type !== "miniToolsLookup") {
      return false;
    }

    if (message.action === "lookupCountry") {
      lookupCountry(message.selectionText);
    }

    if (message.action === "lookupExchange") {
      lookupExchange(message.selectionText);
    }

    return true;
  });

  async function lookupCountry(selectionText) {
    const panel = showPanel({
      title: "查地区",
      subtitle: `正在查询：${cleanSelection(selectionText)}`,
      state: "loading",
    });

    try {
      const rows = await getCountryRows();
      const matches = findCountryMatches(rows, selectionText);

      if (matches.length === 0) {
        renderEmpty(panel, {
          title: "未找到匹配地区",
          text: "可选中两位国际代码、中文地区名、英文名称或电话区号后重试。",
        });
        return;
      }

      renderCountry(panel, matches, selectionText);
    } catch (error) {
      renderError(panel, "地区数据读取失败", error);
    }
  }

  async function lookupExchange(selectionText) {
    const panel = showPanel({
      title: "查汇率",
      subtitle: `正在查询：${cleanSelection(selectionText)}`,
      state: "loading",
    });

    try {
      const currencies = await getCurrencies();
      const parsed = parseCurrencySelection(selectionText, currencies);
      const preferredBases = unique([parsed.fromCode, "usd", "cny"].filter(Boolean));
      const ratePayloads = await Promise.all(
        preferredBases.map((base) => getRates(base).catch((error) => ({ base, error }))),
      );
      const usableRates = ratePayloads.filter((item) => !item.error);

      if (usableRates.length === 0) {
        const firstError = ratePayloads.find((item) => item.error)?.error;
        throw firstError ?? new Error("No exchange-rate data available.");
      }

      renderExchange(panel, {
        selectionText,
        parsed,
        currencies,
        rates: usableRates,
      });
    } catch (error) {
      renderError(panel, "汇率查询失败", error);
    }
  }

  function showPanel({ title, subtitle, state }) {
    closePanel();

    const panel = document.createElement("section");
    panel.className = "mini-tools-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    panel.innerHTML = `
      <header class="mini-tools-header">
        <div>
          <div class="mini-tools-kicker">Mini Tools</div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <button class="mini-tools-close" type="button" aria-label="关闭">×</button>
      </header>
      <div class="mini-tools-body ${state === "loading" ? "is-loading" : ""}">
        <div class="mini-tools-spinner" aria-hidden="true"></div>
        <span>加载中...</span>
      </div>
    `;

    panel.querySelector(".mini-tools-close").addEventListener("click", closePanel);
    document.documentElement.append(panel);
    return panel;
  }

  function closePanel() {
    document.querySelector(".mini-tools-panel")?.remove();
  }

  function renderCountry(panel, matches, selectionText) {
    const normalizedSelection = normalizeLoose(selectionText);
    const body = panel.querySelector(".mini-tools-body");
    body.className = "mini-tools-body";
    body.innerHTML = `
      <div class="mini-tools-result-count">${matches.length} 条匹配结果</div>
      <div class="mini-tools-country-list">
        ${matches
          .map((row) => {
            const selectedKey = COUNTRY_COLUMNS.find(([key]) =>
              countryFieldMatches(key, row[key], normalizedSelection),
            )?.[0];

            return `
              <article class="mini-tools-card">
                <div class="mini-tools-card-title">${escapeHtml(row.country_or_region_zh || row.english_name)}</div>
                <dl class="mini-tools-fields">
                  ${COUNTRY_COLUMNS.map(([key, label]) => {
                    const isSelected = key === selectedKey;
                    return `
                      <div class="${isSelected ? "is-selected" : ""}">
                        <dt>${escapeHtml(label)}</dt>
                        <dd>${escapeHtml(formatCountryValue(key, row[key]))}</dd>
                      </div>
                    `;
                  }).join("")}
                </dl>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderExchange(panel, { selectionText, parsed, currencies, rates }) {
    const body = panel.querySelector(".mini-tools-body");
    const usdRates = rates.find((item) => item.base === "usd");
    const cnyRates = rates.find((item) => item.base === "cny");
    const selectedRates = rates.find((item) => item.base === parsed.fromCode) ?? usdRates ?? rates[0];
    const selectedCode = selectedRates.base;
    const selectedMap = selectedRates.data[selectedCode] ?? {};
    const selectedName = currencies[selectedCode] ?? selectedCode.toUpperCase();
    const amount = parsed.amount ?? 1;
    const currencyOptions = renderCurrencyOptions(currencies);
    let rows = buildRateRows(selectedMap, currencies, amount);

    body.className = "mini-tools-body";
    body.innerHTML = `
      <div class="mini-tools-exchange-summary">
        ${renderPairCard({
          label: "美元 -> 人民币",
          from: "USD",
          to: "CNY",
          amount: 1,
          value: usdRates?.data.usd?.cny,
        })}
        ${renderPairCard({
          label: "人民币 -> 美元",
          from: "CNY",
          to: "USD",
          amount: 1,
          value: cnyRates?.data.cny?.usd,
        })}
      </div>

      <article class="mini-tools-card">
        <div class="mini-tools-card-title">换汇计算器</div>
        <div class="mini-tools-converter">
          <label>
            <span>金额</span>
            <input class="mini-tools-amount" type="number" min="0" step="any" value="${escapeHtml(String(amount))}" />
          </label>
          <label>
            <span>源货币</span>
            <select class="mini-tools-from-currency">${currencyOptions}</select>
          </label>
          <button class="mini-tools-swap" type="button" aria-label="交换货币">⇄</button>
          <label>
            <span>目标货币</span>
            <select class="mini-tools-to-currency">${currencyOptions}</select>
          </label>
        </div>
        <output class="mini-tools-conversion-result">计算中...</output>
        <p class="mini-tools-muted mini-tools-conversion-meta"></p>
      </article>

      <article class="mini-tools-card">
        <div class="mini-tools-card-title mini-tools-rate-title">
          ${escapeHtml(formatAmount(amount))} ${escapeHtml(selectedCode.toUpperCase())}
          <span>${escapeHtml(selectedName)}</span>
        </div>
        <p class="mini-tools-muted mini-tools-rate-meta">
          基准日期 ${escapeHtml(selectedRates.data.date || "未知")}，选中文本：${escapeHtml(cleanSelection(selectionText))}
        </p>
        <label class="mini-tools-filter">
          <span>筛选币种</span>
          <input type="search" placeholder="输入代码或名称，例如 eur" />
        </label>
        <div class="mini-tools-rate-list" role="list">
          ${rows.map(renderRateRow).join("")}
        </div>
      </article>
    `;

    const input = body.querySelector("input[type='search']");
    const list = body.querySelector(".mini-tools-rate-list");
    const amountInput = body.querySelector(".mini-tools-amount");
    const fromSelect = body.querySelector(".mini-tools-from-currency");
    const toSelect = body.querySelector(".mini-tools-to-currency");
    const swapButton = body.querySelector(".mini-tools-swap");
    const resultOutput = body.querySelector(".mini-tools-conversion-result");
    const meta = body.querySelector(".mini-tools-conversion-meta");
    const rateTitle = body.querySelector(".mini-tools-rate-title");
    const rateMeta = body.querySelector(".mini-tools-rate-meta");

    fromSelect.value = parsed.fromCode;
    toSelect.value = parsed.toCode;

    const updateConversion = async () => {
      const fromCode = fromSelect.value;
      const toCode = toSelect.value;
      const inputAmount = Number(amountInput.value);
      const nextAmount = Number.isFinite(inputAmount) ? inputAmount : 0;
      resultOutput.value = "计算中...";

      try {
        const ratePayload = await getRates(fromCode);
        const rate = ratePayload.data[fromCode]?.[toCode];
        if (!Number.isFinite(rate)) {
          resultOutput.value = "暂无该币种汇率";
          meta.textContent = "";
          return;
        }

        const converted = nextAmount * rate;
        resultOutput.value = `${formatAmount(nextAmount)} ${fromCode.toUpperCase()} = ${formatRate(converted)} ${toCode.toUpperCase()}`;
        meta.textContent = `1 ${fromCode.toUpperCase()} = ${formatRate(rate)} ${toCode.toUpperCase()}，基准日期 ${ratePayload.data.date || "未知"}`;
        rows = buildRateRows(ratePayload.data[fromCode] ?? {}, currencies, nextAmount);
        rateTitle.innerHTML = `${escapeHtml(formatAmount(nextAmount))} ${escapeHtml(fromCode.toUpperCase())} <span>${escapeHtml(currencies[fromCode] ?? fromCode.toUpperCase())}</span>`;
        rateMeta.textContent = `基准日期 ${ratePayload.data.date || "未知"}，选中文本：${cleanSelection(selectionText)}`;
        renderFilteredRateRows();
      } catch (error) {
        resultOutput.value = "换算失败";
        meta.textContent = error?.message ?? String(error);
      }
    };

    amountInput.addEventListener("input", updateConversion);
    fromSelect.addEventListener("change", updateConversion);
    toSelect.addEventListener("change", updateConversion);
    swapButton.addEventListener("click", () => {
      const fromCode = fromSelect.value;
      fromSelect.value = toSelect.value;
      toSelect.value = fromCode;
      updateConversion();
    });

    input.addEventListener("input", () => {
      renderFilteredRateRows();
    });
    list.innerHTML = rows.map(renderRateRow).join("");
    updateConversion();

    function renderFilteredRateRows() {
      const query = normalizeLoose(input.value);
      const filteredRows = rows.filter(
        (row) => normalizeLoose(row.code).includes(query) || normalizeLoose(row.name).includes(query),
      );
      list.innerHTML = (query ? filteredRows.slice(0, 120) : filteredRows).map(renderRateRow).join("");
    }
  }

  function buildRateRows(rateMap, currencies, amount) {
    return Object.entries(rateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => ({
        code,
        name: currencies[code] ?? code.toUpperCase(),
        rate,
        value: rate * amount,
      }));
  }

  function renderPairCard({ label, from, to, amount, value }) {
    const displayValue = Number.isFinite(value) ? formatRate(value * amount) : "暂无数据";
    return `
      <article class="mini-tools-pair-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatAmount(amount))} ${escapeHtml(from)} = ${escapeHtml(displayValue)} ${escapeHtml(to)}</strong>
      </article>
    `;
  }

  function renderRateRow(row) {
    return `
      <div class="mini-tools-rate-row" role="listitem">
        <div>
          <strong>${escapeHtml(row.code.toUpperCase())}</strong>
          <span>${escapeHtml(row.name)}</span>
        </div>
        <output>${escapeHtml(formatRate(row.value))}</output>
      </div>
    `;
  }

  function renderEmpty(panel, { title, text }) {
    const body = panel.querySelector(".mini-tools-body");
    body.className = "mini-tools-body";
    body.innerHTML = `
      <div class="mini-tools-empty">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  function renderError(panel, title, error) {
    const body = panel.querySelector(".mini-tools-body");
    body.className = "mini-tools-body";
    body.innerHTML = `
      <div class="mini-tools-empty is-error">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(error?.message ?? String(error))}</p>
      </div>
    `;
  }

  async function getCountryRows() {
    countryRowsPromise ??= fetch(chrome.runtime.getURL("data/country_codes.csv"))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.text();
      })
      .then(parseCsv);
    return countryRowsPromise;
  }

  async function getCurrencies() {
    currenciesPromise ??= fetchJsonWithFallback("currencies.json", "data/exchange-api/currencies.json");
    return currenciesPromise;
  }

  async function getRates(base) {
    if (!ratesPromises.has(base)) {
      ratesPromises.set(
        base,
        fetchJsonWithFallback(
          `currencies/${base}.json`,
          `${LOCAL_CURRENCY_PATH}/${base}.json`,
        ).then((data) => ({ base, data })),
      );
    }
    return ratesPromises.get(base);
  }

  async function fetchJsonWithFallback(remotePath, localPath) {
    const attempts = [
      ...API_BASES.map((baseUrl) => `${baseUrl}/${remotePath}`),
      chrome.runtime.getURL(localPath),
    ];
    let lastError;

    for (const url of attempts) {
      try {
        const response = await fetch(url, { headers: { accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error(`Unable to load ${remotePath}`);
  }

  function findCountryMatches(rows, selectionText) {
    const query = normalizeLoose(selectionText);
    const phoneQuery = normalizePhone(selectionText);
    const exactMatches = rows.filter((row) =>
      COUNTRY_COLUMNS.some(([key]) => countryFieldMatches(key, row[key], query, phoneQuery)),
    );

    if (exactMatches.length > 0) {
      return exactMatches.slice(0, 20);
    }

    return rows
      .filter((row) =>
        COUNTRY_COLUMNS.some(([key]) => {
          const value = key === "phone_code" ? normalizePhone(row[key]) : normalizeLoose(row[key]);
          return value && query && value.includes(query);
        }),
      )
      .slice(0, 20);
  }

  function countryFieldMatches(key, value, query, phoneQuery = normalizePhone(query)) {
    if (key === "phone_code") {
      return normalizePhone(value) === phoneQuery;
    }
    return normalizeLoose(value) === query;
  }

  function parseCurrencySelection(selectionText, currencies) {
    const text = cleanSelection(selectionText);
    const amountMatch = text.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)(?=$|[^\d.])/);
    const amount = amountMatch ? Number(amountMatch[1]) : 1;
    const parts = text.split(/\s*(?:换算|兑换|转换|转成|转为|转|到|兑|to|in)\s*/i);
    const firstPartCode = findCurrencyCode(parts[0], currencies);
    const secondPartCode = parts.length > 1 ? findCurrencyCode(parts.slice(1).join(" "), currencies) : undefined;
    const mentions = findCurrencyMentions(text, currencies);
    const fromCode = firstPartCode ?? mentions[0] ?? "usd";
    const toCode = secondPartCode ?? mentions.find((code) => code !== fromCode) ?? defaultTargetFor(fromCode);

    return {
      amount: Number.isFinite(amount) ? amount : 1,
      fromCode,
      toCode,
    };
  }

  function findCurrencyMentions(text, currencies) {
    const mentions = [];
    const add = (code) => {
      if (code && currencies[code] && !mentions.includes(code)) {
        mentions.push(code);
      }
    };

    for (const [, code] of findChineseCurrencyAliases(text)) {
      add(code);
    }

    const normalizedText = normalizeLoose(text);
    const tokens = normalizedText.split(/[^a-z0-9]+/).filter(Boolean);
    const entries = Object.entries(currencies);
    for (const [currencyCode] of entries) {
      if (tokens.includes(currencyCode)) {
        add(currencyCode);
      }
    }
    for (const [currencyCode, name] of entries) {
      const normalizedName = normalizeLoose(name);
      if (normalizedText === normalizedName || normalizedText.includes(normalizedName)) {
        add(currencyCode);
      }
    }

    return mentions;
  }

  function findCurrencyCode(text, currencies) {
    return findCurrencyMentions(text, currencies)[0];
  }

  function findChineseCurrencyAliases(text) {
    const normalizedText = String(text ?? "").toLowerCase();
    return CURRENCY_ALIASES
      .map(([alias, code]) => ({ alias, code, index: normalizedText.indexOf(alias.toLowerCase()) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length)
      .map((item) => [item.alias, item.code]);
  }

  function defaultTargetFor(fromCode) {
    if (fromCode === "usd") {
      return "cny";
    }
    if (fromCode === "cny") {
      return "usd";
    }
    return "cny";
  }

  function renderCurrencyOptions(currencies) {
    return Object.entries(currencies)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => `<option value="${escapeHtml(code)}">${escapeHtml(code.toUpperCase())} - ${escapeHtml(name)}</option>`)
      .join("");
  }

  function parseCsv(csvText) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const next = csvText[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    if (value || row.length > 0) {
      row.push(value);
      rows.push(row);
    }

    const [headers, ...records] = rows.filter((item) => item.length > 1);
    return records.map((record) =>
      Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ""), record[index] ?? ""])),
    );
  }

  function cleanSelection(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function normalizeLoose(value) {
    return cleanSelection(value).toLowerCase().replace(/^\+/, "");
  }

  function normalizePhone(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
  }

  function formatCountryValue(key, value) {
    if (key === "phone_code" && value) {
      return `+${value}`;
    }
    return value || "-";
  }

  function formatAmount(value) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(value);
  }

  function formatRate(value) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 8 }).format(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  }

  function unique(values) {
    return [...new Set(values)];
  }
})();
