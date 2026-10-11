(function () {
  "use strict";

  var CLIENT_KEY = "pedeai_client_v1";
  var page = document.body.dataset.page;
  var state = emptyState();
  var cart = {};
  var cartStep = "items";
  var activeCategory = "Todos";
  var editingId = null;
  var pendingPhoto = "";
  var saveTimer = null;

  var PAYMENTS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Vale-refeição"];

  function $(id) {
    return document.getElementById(id);
  }

  function emptyState() {
    return {
      store: {
        name: "PedeAi",
        subtitle: "Cardápio virtual com pedido pelo WhatsApp.",
        address: "",
        whatsapp: "",
        deliveryFee: 0,
        minOrder: 0,
        color: "#e8590c",
        status: "Aberto",
        payments: ["Pix", "Dinheiro"]
      },
      categories: [],
      items: []
    };
  }

  function api(action, options) {
    options = options || {};
    var request = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: options.body ? { "Content-Type": "application/json" } : {}
    };
    if (options.body) request.body = JSON.stringify(options.body);

    return fetch("api.php?action=" + encodeURIComponent(action), request)
      .then(function (response) {
        return response.json().catch(function () {
          return { ok: false, error: "Resposta inválida do servidor." };
        }).then(function (data) {
          if (!response.ok || !data.ok) {
            throw new Error(data.error || "Erro na requisição.");
          }
          return data;
        });
      });
  }

  function setBrandColor() {
    document.documentElement.style.setProperty("--color", state.store.color || "#e8590c");
  }

  function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function numberFromText(value) {
    var parsed = parseFloat(String(value || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function textFromNumber(value) {
    return value ? String(value).replace(".", ",") : "";
  }

  function makeId() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function initials(name) {
    return String(name || "P").trim().split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join("");
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function toast(message) {
    var el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () {
      el.classList.remove("show");
    }, 2200);
  }

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
  }

  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1000;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPhoto(item, className) {
    if (item.photo) {
      return '<div class="' + className + '"><img src="' + item.photo + '" alt=""></div>';
    }
    return '<div class="' + className + '" aria-hidden="true">' + escapeHtml(initials(item.name)) + "</div>";
  }

  function initAdmin() {
    setBrandColor();
    bindLogin();
    api("me").then(function (data) {
      if (data.admin) {
        showAdmin(data.admin);
      } else {
        showLogin();
      }
    }).catch(showLogin);
  }

  function bindLogin() {
    $("loginForm").addEventListener("submit", function (event) {
      event.preventDefault();
      $("loginError").textContent = "";
      api("login", {
        method: "POST",
        body: {
          email: $("loginEmail").value.trim(),
          password: $("loginPassword").value
        }
      }).then(function (data) {
        $("loginPassword").value = "";
        showAdmin(data.admin);
      }).catch(function (error) {
        $("loginError").textContent = error.message;
      });
    });

    $("logoutButton").addEventListener("click", function () {
      api("logout", { method: "POST", body: {} }).finally(function () {
        window.location.reload();
      });
    });
  }

  function showLogin() {
    $("loginView").hidden = false;
    $("adminTop").hidden = true;
    $("adminView").hidden = true;
  }

  function showAdmin(admin) {
    $("loginView").hidden = true;
    $("adminTop").hidden = false;
    $("adminView").hidden = false;
    $("adminUser").textContent = admin && admin.name ? admin.name : "";
    loadAdminData();
  }

  function loadAdminData() {
    api("admin_data").then(function (data) {
      state = normalizeState(data.state);
      setBrandColor();
      bindAdminSettings();
      bindAdminActions();
      renderAdmin();
    }).catch(function (error) {
      toast(error.message);
      showLogin();
    });
  }

  function normalizeState(value) {
    value = value || emptyState();
    value.store = Object.assign(emptyState().store, value.store || {});
    value.categories = Array.isArray(value.categories) ? value.categories : [];
    value.items = Array.isArray(value.items) ? value.items : [];
    if (!value.categories.length) value.categories = ["Cardápio"];
    return value;
  }

  function saveState(immediate) {
    setBrandColor();
    if ($("saveStatus")) $("saveStatus").textContent = "Salvando...";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      api("save_state", { method: "POST", body: { state: state } }).then(function (data) {
        state = normalizeState(data.state);
        if ($("saveStatus")) $("saveStatus").textContent = "Salvo";
      }).catch(function (error) {
        if ($("saveStatus")) $("saveStatus").textContent = "Erro";
        toast(error.message);
      });
    }, immediate ? 0 : 400);
  }

  function bindAdminSettings() {
    if (bindAdminSettings.done) return;
    bindAdminSettings.done = true;

    $("storeName").addEventListener("input", function () { state.store.name = this.value; saveState(); });
    $("storeWhatsapp").addEventListener("input", function () { state.store.whatsapp = this.value; saveState(); });
    $("storeSubtitle").addEventListener("input", function () { state.store.subtitle = this.value; saveState(); });
    $("storeAddress").addEventListener("input", function () { state.store.address = this.value; saveState(); });
    $("deliveryFee").addEventListener("input", function () { state.store.deliveryFee = numberFromText(this.value); saveState(); });
    $("minOrder").addEventListener("input", function () { state.store.minOrder = numberFromText(this.value); saveState(); });
    $("brandColor").addEventListener("input", function () { state.store.color = this.value; saveState(); });
    $("storeStatus").addEventListener("change", function () { state.store.status = this.value; saveState(); });

    $("paymentChecks").addEventListener("change", function () {
      state.store.payments = Array.prototype.slice.call(this.querySelectorAll("input:checked")).map(function (input) {
        return input.value;
      });
      saveState();
    });
  }

  function bindAdminActions() {
    if (bindAdminActions.done) return;
    bindAdminActions.done = true;

    $("addCategory").addEventListener("click", addCategory);
    $("categoryInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") addCategory();
    });
    $("newItem").addEventListener("click", function () { openItemDialog(); });
    $("itemPhoto").addEventListener("change", onPhotoChange);
    $("itemForm").addEventListener("submit", saveItem);
    $("itemDialogClose").addEventListener("click", function () { $("itemDialog").close(); });
    $("deleteItem").addEventListener("click", deleteCurrentItem);
    $("exportData").addEventListener("click", function () {
      download("backup-pedeai.json", JSON.stringify(state, null, 2), "application/json;charset=utf-8");
    });
    $("importData").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", importData);
  }

  function renderAdmin() {
    $("storeName").value = state.store.name || "";
    $("storeWhatsapp").value = state.store.whatsapp || "";
    $("storeSubtitle").value = state.store.subtitle || "";
    $("storeAddress").value = state.store.address || "";
    $("deliveryFee").value = textFromNumber(state.store.deliveryFee);
    $("minOrder").value = textFromNumber(state.store.minOrder);
    $("brandColor").value = state.store.color || "#e8590c";
    $("storeStatus").value = state.store.status || "Aberto";

    $("paymentChecks").innerHTML = PAYMENTS.map(function (payment) {
      var checked = state.store.payments.indexOf(payment) >= 0 ? " checked" : "";
      return '<label><input type="checkbox" value="' + escapeHtml(payment) + '"' + checked + "> " + escapeHtml(payment) + "</label>";
    }).join("");

    renderCategories();
    renderAdminItems();
  }

  function renderCategories() {
    $("categoryList").innerHTML = state.categories.map(function (category) {
      return '<span class="chip">' + escapeHtml(category) + '<button type="button" data-remove-category="' + escapeHtml(category) + '" aria-label="Remover categoria">×</button></span>';
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-remove-category]"), function (button) {
      button.addEventListener("click", function () {
        var category = button.dataset.removeCategory;
        if (state.categories.length === 1) {
          toast("Mantenha pelo menos uma categoria");
          return;
        }
        state.categories = state.categories.filter(function (item) { return item !== category; });
        state.items.forEach(function (item) {
          if (item.category === category) item.category = state.categories[0];
        });
        saveState(true);
        renderAdmin();
      });
    });
  }

  function addCategory() {
    var input = $("categoryInput");
    var name = input.value.trim();
    if (!name) return;
    if (state.categories.some(function (category) { return category.toLowerCase() === name.toLowerCase(); })) {
      toast("Categoria já existe");
      return;
    }
    state.categories.push(name);
    input.value = "";
    saveState(true);
    renderCategories();
    toast("Categoria adicionada");
  }

  function renderAdminItems() {
    $("itemCount").textContent = state.items.length + (state.items.length === 1 ? " item cadastrado" : " itens cadastrados");

    if (!state.items.length) {
      $("adminItems").innerHTML = '<div class="empty-state">Nenhum item ainda. Clique em "Novo item" para começar.</div>';
      return;
    }

    $("adminItems").innerHTML = state.items.map(function (item) {
      var statusClass = item.available ? "ok" : "off";
      var statusText = item.available ? "Disponível" : "Oculto";
      return '<article class="admin-card">' +
        renderPhoto(item, "thumb") +
        '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.category) + " · " + money(item.price) + '</small>' +
        '<div class="muted-row"><span class="mini-pill ' + statusClass + '">' + statusText + '</span></div></div>' +
        '<button class="button secondary" type="button" data-edit="' + item.id + '">Editar</button>' +
        "</article>";
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (button) {
      button.addEventListener("click", function () { openItemDialog(button.dataset.edit); });
    });
  }

  function openItemDialog(id) {
    var item = id ? state.items.find(function (entry) { return entry.id === id; }) : null;
    editingId = item ? item.id : null;
    pendingPhoto = item ? item.photo || "" : "";

    $("dialogTitle").textContent = item ? "Editar item" : "Novo item";
    $("itemName").value = item ? item.name : "";
    $("itemCategory").innerHTML = state.categories.map(function (category) {
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + "</option>";
    }).join("");
    $("itemCategory").value = item ? item.category : state.categories[0];
    $("itemPrice").value = item ? textFromNumber(item.price) : "";
    $("itemDescription").value = item ? item.description : "";
    $("itemAvailable").checked = item ? item.available !== false : true;
    $("itemPhoto").value = "";
    $("deleteItem").style.visibility = item ? "visible" : "hidden";
    renderPhotoPreview();
    $("itemDialog").showModal();
  }

  function renderPhotoPreview() {
    $("photoPreview").innerHTML = pendingPhoto ? '<img src="' + pendingPhoto + '" alt="">' : "Foto";
  }

  function onPhotoChange() {
    var file = this.files && this.files[0];
    if (!file) return;
    resizeImage(file).then(function (url) {
      pendingPhoto = url;
      renderPhotoPreview();
    }).catch(function () {
      toast("Não foi possível ler a foto");
    });
  }

  function saveItem(event) {
    event.preventDefault();
    var data = {
      id: editingId || makeId(),
      name: $("itemName").value.trim(),
      category: $("itemCategory").value,
      description: $("itemDescription").value.trim(),
      price: numberFromText($("itemPrice").value),
      available: $("itemAvailable").checked,
      photo: pendingPhoto
    };

    if (!data.name) {
      toast("Informe o nome do item");
      return;
    }
    if (data.price <= 0) {
      toast("Informe um preço válido");
      return;
    }

    if (editingId) {
      state.items = state.items.map(function (item) { return item.id === editingId ? data : item; });
    } else {
      state.items.push(data);
    }
    saveState(true);
    $("itemDialog").close();
    renderAdminItems();
    toast("Item salvo");
  }

  function deleteCurrentItem() {
    if (!editingId || !confirm("Excluir este item?")) return;
    state.items = state.items.filter(function (item) { return item.id !== editingId; });
    saveState(true);
    $("itemDialog").close();
    renderAdminItems();
    toast("Item excluído");
  }

  function importData() {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = normalizeState(JSON.parse(reader.result));
        saveState(true);
        renderAdmin();
        toast("Backup importado");
      } catch (error) {
        toast("Arquivo inválido");
      }
    };
    reader.readAsText(file);
    this.value = "";
  }

  function initMenu() {
    api("menu").then(function (data) {
      state = normalizeState(data.state);
      setBrandColor();
      renderPublicHeader();
      renderPublicCategories();
      renderPublicItems();
      renderCartBar();
      $("cartBar").addEventListener("click", openCart);
      $("cartClose").addEventListener("click", function () { $("cartDialog").close(); });
      $("checkoutNext").addEventListener("click", function () {
        if (!cartEntries().length) {
          $("formError").textContent = "Seu carrinho está vazio.";
          return;
        }
        if (subtotal() < Number(state.store.minOrder || 0)) {
          $("formError").textContent = "O pedido mínimo é " + money(state.store.minOrder) + ".";
          return;
        }
        setCartStep("info");
      });
      $("checkoutBack").addEventListener("click", function () { setCartStep("items"); });
      $("fulfillment").addEventListener("change", syncFulfillment);
      $("orderForm").addEventListener("submit", sendOrder);
      restoreClient();
    }).catch(function (error) {
      $("publicItems").innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + "</div>";
    });
  }

  function publicItems() {
    return state.items.filter(function (item) {
      return item.available !== false && (activeCategory === "Todos" || item.category === activeCategory);
    });
  }

  function renderPublicHeader() {
    document.title = state.store.name || "PedeAi";
    $("publicName").textContent = state.store.name || "PedeAi";
    $("publicSubtitle").textContent = state.store.subtitle || "Cardápio virtual com pedido pelo WhatsApp.";
    $("publicAddress").textContent = state.store.address || "Atendimento local e delivery";
    $("publicStatus").textContent = state.store.status || "Aberto";
    $("publicMinOrder").textContent = state.store.minOrder > 0 ? "Mínimo " + money(state.store.minOrder) : "";
  }

  function renderPublicCategories() {
    var categories = ["Todos"].concat(state.categories);
    $("publicCategories").innerHTML = categories.map(function (category) {
      return '<button class="tab' + (category === activeCategory ? " active" : "") + '" type="button" data-category="' + escapeHtml(category) + '">' + escapeHtml(category) + "</button>";
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-category]"), function (button) {
      button.addEventListener("click", function () {
        activeCategory = button.dataset.category;
        renderPublicCategories();
        renderPublicItems();
      });
    });
  }

  function renderPublicItems() {
    var items = publicItems();
    if (!items.length) {
      $("publicItems").innerHTML = '<div class="empty-state">Nenhum item disponível nesta categoria.</div>';
      return;
    }

    $("publicItems").innerHTML = items.map(function (item) {
      var quantity = cart[item.id] || 0;
      var control = quantity ? stepper(item.id, quantity) : '<button class="button" type="button" data-add="' + item.id + '">Adicionar</button>';
      return '<article class="menu-card">' +
        renderPhoto(item, "menu-photo") +
        '<div class="menu-body"><div><span class="mini-pill">' + escapeHtml(item.category) + '</span><h2>' + escapeHtml(item.name) + '</h2></div>' +
        '<p>' + escapeHtml(item.description || "Sem descrição.") + '</p>' +
        '<div class="menu-footer"><span class="price">' + money(item.price) + '</span>' + control + '</div></div></article>';
    }).join("");

    bindQuantityButtons($("publicItems"));
  }

  function stepper(id, quantity) {
    return '<div class="stepper"><button type="button" data-dec="' + id + '">−</button><span>' + quantity + '</span><button type="button" data-add="' + id + '">+</button></div>';
  }

  function bindQuantityButtons(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll("[data-add]"), function (button) {
      button.addEventListener("click", function () { changeCart(button.dataset.add, 1); });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-dec]"), function (button) {
      button.addEventListener("click", function () { changeCart(button.dataset.dec, -1); });
    });
  }

  function changeCart(id, delta) {
    var next = (cart[id] || 0) + delta;
    if (next <= 0) delete cart[id];
    else cart[id] = next;
    renderPublicItems();
    renderCartBar();
    if ($("cartDialog").open) renderCartDialog();
  }

  function cartEntries() {
    return Object.keys(cart).map(function (id) {
      var item = state.items.find(function (entry) { return entry.id === id; });
      return item ? { item: item, quantity: cart[id] } : null;
    }).filter(Boolean);
  }

  function subtotal() {
    return cartEntries().reduce(function (sum, entry) {
      return sum + entry.item.price * entry.quantity;
    }, 0);
  }

  function deliveryFee() {
    return $("fulfillment") && $("fulfillment").value === "Retirada" ? 0 : Number(state.store.deliveryFee || 0);
  }

  function total() {
    return subtotal() + deliveryFee();
  }

  function renderCartBar() {
    var count = Object.keys(cart).reduce(function (sum, id) { return sum + cart[id]; }, 0);
    $("cartBar").classList.toggle("visible", count > 0);
    $("cartCount").textContent = count + (count === 1 ? " item" : " itens");
    $("cartTotal").textContent = money(subtotal());
  }

  function openCart() {
    cartStep = "items";
    renderCartDialog();
    $("cartDialog").showModal();
  }

  function renderCartDialog() {
    var entries = cartEntries();
    $("cartLines").innerHTML = entries.map(function (entry) {
      return '<div class="cart-line"><div><strong>' + escapeHtml(entry.item.name) + '</strong><small>' + entry.quantity + " × " + money(entry.item.price) + '</small></div>' +
        '<div class="line-total"><div class="stepper"><button type="button" data-dec="' + entry.item.id + '">−</button><span>' + entry.quantity + '</span><button type="button" data-add="' + entry.item.id + '">+</button></div><small>' + money(entry.item.price * entry.quantity) + '</small></div></div>';
    }).join("");

    $("cartTotals").innerHTML = totalsHtml(false);
    $("paymentMethod").innerHTML = state.store.payments.map(function (payment) {
      return '<option>' + escapeHtml(payment) + "</option>";
    }).join("");

    bindQuantityButtons($("cartLines"));
    syncFulfillment();
    setCartStep(cartStep);
  }

  function setCartStep(step) {
    cartStep = step;
    var isInfo = step === "info";
    $("cartItemsStep").hidden = isInfo;
    $("cartInfoStep").hidden = !isInfo;
    $("cartTitle").textContent = isInfo ? "Dados do pedido" : "Seu pedido";
    $("formError").textContent = "";
    if (isInfo) {
      $("clientName").focus();
    }
  }

  function totalsHtml(includeDelivery) {
    return '<div class="total-row"><span>Subtotal</span><strong>' + money(subtotal()) + '</strong></div>' +
      (includeDelivery && deliveryFee() > 0 ? '<div class="total-row"><span>Entrega</span><strong>' + money(deliveryFee()) + '</strong></div>' : "") +
      '<div class="total-row grand"><span>Total dos itens</span><strong>' + money(subtotal()) + '</strong></div>';
  }

  function syncFulfillment() {
    var delivery = $("fulfillment").value === "Entrega";
    $("addressFields").style.display = delivery ? "block" : "none";
    if ($("cartDialog").open) $("cartTotals").innerHTML = totalsHtml(false);
  }

  function restoreClient() {
    try {
      var data = JSON.parse(localStorage.getItem(CLIENT_KEY) || "{}");
      $("clientName").value = data.name || "";
      $("clientAddress").value = data.address || "";
      $("clientReference").value = data.reference || "";
    } catch (error) {}
  }

  function sendOrder(event) {
    event.preventDefault();
    var entries = cartEntries();
    var error = $("formError");
    error.textContent = "";

    if (!entries.length) {
      error.textContent = "Seu carrinho está vazio.";
      return;
    }
    if (subtotal() < Number(state.store.minOrder || 0)) {
      error.textContent = "O pedido mínimo é " + money(state.store.minOrder) + ".";
      return;
    }
    if (!state.store.whatsapp.replace(/\D/g, "")) {
      error.textContent = "A loja ainda não configurou o WhatsApp.";
      return;
    }
    if (!$("clientName").value.trim()) {
      error.textContent = "Informe seu nome.";
      return;
    }
    if ($("fulfillment").value === "Entrega" && !$("clientAddress").value.trim()) {
      error.textContent = "Informe o endereço de entrega.";
      return;
    }

    var client = {
      name: $("clientName").value.trim(),
      address: $("clientAddress").value.trim(),
      reference: $("clientReference").value.trim()
    };
    localStorage.setItem(CLIENT_KEY, JSON.stringify(client));

    var lines = [];
    lines.push("*NOVO PEDIDO*");
    lines.push("*" + (state.store.name || "Cardápio") + "*");
    lines.push("");
    entries.forEach(function (entry) {
      lines.push(entry.quantity + "x " + entry.item.name + " - " + money(entry.item.price * entry.quantity));
    });
    lines.push("");
    lines.push("Subtotal: " + money(subtotal()));
    if (deliveryFee() > 0) lines.push("Entrega: " + money(deliveryFee()));
    lines.push("*Total: " + money(total()) + "*");
    lines.push("");
    lines.push("*Cliente*");
    lines.push(client.name);
    lines.push("");
    lines.push("*" + $("fulfillment").value + "*");
    if ($("fulfillment").value === "Entrega") {
      lines.push(client.address);
      if (client.reference) lines.push("Referência: " + client.reference);
    } else {
      lines.push("Retirada no local");
    }
    lines.push("");
    lines.push("*Pagamento*");
    lines.push($("paymentMethod").value || "Não informado");
    if ($("orderNotes").value.trim()) {
      lines.push("");
      lines.push("*Observações*");
      lines.push($("orderNotes").value.trim());
    }

    var phone = state.store.whatsapp.replace(/\D/g, "");
    if (phone.slice(0, 2) !== "55") phone = "55" + phone;
    window.location.href = "https://wa.me/" + phone + "?text=" + encodeURIComponent(lines.join("\n"));
  }

  setBrandColor();
  if (page === "admin") initAdmin();
  if (page === "menu") initMenu();
})();
