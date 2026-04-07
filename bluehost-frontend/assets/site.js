(function () {
  const html = document.documentElement;
  const apiBaseUrl = String(html.dataset.apiBaseUrl || "").replace(/\/$/, "");

  async function apiFetch(path, options = {}) {
    const config = { ...options };
    config.credentials = options.credentials || "include";
    config.headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };

    if (config.body && !(config.body instanceof FormData) && !config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${apiBaseUrl}${path}`, config);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : `Request failed (${response.status})`;
      const error = new Error(message);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function setMessage(target, type, text) {
    if (!target) {
      return;
    }

    target.className = `message message-${type}`;
    target.textContent = text;
    target.hidden = !text;
  }

  async function submitJsonForm(form, path, successMessage, redirectPath) {
    const message = form.querySelector("[data-form-message]");
    const button = form.querySelector("button[type='submit']");

    if (button) {
      button.disabled = true;
    }

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (response.redirect_url) {
        window.location.href = response.redirect_url;
        return;
      }

      setMessage(message, "success", successMessage);
      if (redirectPath) {
        window.setTimeout(() => {
          window.location.href = redirectPath;
        }, 500);
      }
    } catch (error) {
      setMessage(message, "error", error.message);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-share-page]");
    if (!button) {
      return;
    }

    const shareUrl = button.getAttribute("data-share-url") || window.location.href;
    const shareTitle = button.getAttribute("data-share-title") || document.title;
    const shareText = button.getAttribute("data-share-text") || "";

    try {
      if (navigator.share) {
        await navigator.share({
          url: shareUrl,
          title: shareTitle,
          text: shareText
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = "Share";
      }, 1200);
    } catch (error) {
      // no-op
    }
  });

  window.myurlcFrontend = {
    apiBaseUrl,
    apiFetch,
    setMessage,
    submitJsonForm
  };
}());
