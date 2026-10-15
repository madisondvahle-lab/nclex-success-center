(() => {
  const CLIENT_ID = "294279908495-9qd6hufjv367hka5vqmsnd8876eahcir.apps.googleusercontent.com";
  const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
  const SEARCH_QUERY = "is:unread has:attachment";
  const MAX_MESSAGES = 20;
  let accessToken = null;
  let tokenClient = null;
  let googleScriptPromise = null;
  let expiresAt = 0;

  const $ = (id) => document.getElementById(id);
  const setStatus = (message) => { $("gmail-status").textContent = message; };

  function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => window.google?.accounts?.oauth2
        ? resolve()
        : reject(new Error("Google sign-in did not initialize."));
      script.onerror = () => reject(new Error("Could not load Google sign-in."));
      document.head.append(script);
    });
    return googleScriptPromise;
  }

  function prepareGoogleIdentity() {
    return loadGoogleIdentity().then(() => {
      tokenClient ||= window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: (response) => {
          $("gmail-connect").disabled = false;
          if (response.error) {
            accessToken = null;
            setStatus("Gmail connection failed: " + response.error);
            return;
          }
          accessToken = response.access_token;
          expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          $("gmail-connect").textContent = "Reconnect Gmail";
          $("gmail-refresh").classList.remove("hidden");
          loadMessages();
        },
      });
    });
  }

  function connect() {
    if (!CLIENT_ID) {
      setStatus("Gmail setup is not complete. Add the Google OAuth client ID in admin-gmail.js, then publish the portal.");
      return;
    }
    if (!tokenClient) {
      setStatus("Google sign-in is still loading. Try Connect Gmail again in a moment.");
      prepareGoogleIdentity().catch((error) => setStatus(error.message || "Google sign-in could not be loaded."));
      return;
    }
    $("gmail-connect").disabled = true;
    setStatus("Opening Google sign-in…");
    tokenClient.requestAccessToken();
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function getAttachments(payload, path = []) {
    if (!payload) return [];
    const parts = [...(payload.parts || [])];
    if (payload.filename && (payload.body?.attachmentId || payload.body?.data)) {
      return [{
        filename: payload.filename,
        mimeType: payload.mimeType || "application/octet-stream",
        attachmentId: payload.body.attachmentId || null,
        data: payload.body.data || null,
        messageId: path[0] || null,
      }];
    }
    return parts.flatMap((part) => getAttachments(part, path));
  }

  function header(message, name) {
    return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
  }

  async function gmailFetch(path) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + path, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (response.status === 401) {
      accessToken = null;
      throw new Error("Gmail access expired. Reconnect to refresh the inbox.");
    }
    if (!response.ok) throw new Error("Gmail returned an error (" + response.status + ").");
    return response.json();
  }

  function addText(parent, className, text) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function renderMessage(message) {
    const article = document.createElement("article");
    article.className = "gmail-message";
    addText(article, "gmail-subject", header(message, "Subject") || "(No subject)");
    addText(article, "gmail-meta", [header(message, "From"), header(message, "Date")].filter(Boolean).join(" · "));
    if (message.snippet) addText(article, "gmail-snippet", message.snippet);

    const attachments = getAttachments(message.payload, [message.id]);
    if (attachments.length) {
      const list = document.createElement("div");
      list.className = "gmail-attachments";
      for (const attachment of attachments) {
        const row = document.createElement("div");
        row.className = "gmail-attachment";
        const name = document.createElement("span");
        name.textContent = attachment.filename;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Download";
        button.addEventListener("click", () => downloadAttachment(attachment, button));
        row.append(name, button);
        list.append(row);
      }
      article.append(list);
    }
    $("gmail-messages").append(article);
  }

  async function downloadAttachment(attachment, button) {
    button.disabled = true;
    try {
      let data = attachment.data;
      if (attachment.attachmentId) {
        const result = await gmailFetch(`messages/${encodeURIComponent(attachment.messageId)}/attachments/${encodeURIComponent(attachment.attachmentId)}`);
        data = result.data;
      }
      if (!data) throw new Error("This attachment has no downloadable content.");
      const blob = new Blob([decodeBase64Url(data)], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setStatus(error.message || "The attachment could not be downloaded.");
    } finally {
      button.disabled = false;
    }
  }

  async function loadMessages() {
    if (!accessToken || Date.now() >= expiresAt) {
      accessToken = null;
      setStatus("Gmail access expired. Reconnect to refresh the inbox.");
      return;
    }
    $("gmail-refresh").disabled = true;
    $("gmail-messages").replaceChildren();
    setStatus("Checking unread messages with attachments…");
    try {
      const result = await gmailFetch(`messages?q=${encodeURIComponent(SEARCH_QUERY)}&maxResults=${MAX_MESSAGES}`);
      const messages = await Promise.all((result.messages || []).map(({ id }) =>
        gmailFetch(`messages/${encodeURIComponent(id)}?format=full`)
      ));
      if (!messages.length) {
        setStatus("No unread emails with attachments.");
        return;
      }
      setStatus(`${messages.length} unread email${messages.length === 1 ? "" : "s"} with attachments. Messages stay unread in Gmail.`);
      messages.forEach(renderMessage);
    } catch (error) {
      setStatus(error.message || "Unread Gmail messages could not be loaded.");
    } finally {
      $("gmail-refresh").disabled = false;
    }
  }

  window.initAdminGmail = () => {
    $("gmail-connect").addEventListener("click", connect);
    $("gmail-refresh").addEventListener("click", loadMessages);
    if (CLIENT_ID) prepareGoogleIdentity().catch((error) => setStatus(error.message || "Google sign-in could not be loaded."));
  };
})();
