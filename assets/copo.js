/* Copo & Co. — componentes propios sobre Dawn.
   Sin dependencias. Se carga con defer desde snippets/copo-head.liquid. */
(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Carrito: añade líneas y abre el carrito lateral de Dawn ---------- */
  const CopoCart = {
    async add(items, triggerButton) {
      const cartDrawer = document.querySelector('cart-drawer');
      const body = { items };
      if (cartDrawer && typeof cartDrawer.getSectionsToRender === 'function') {
        body.sections = cartDrawer.getSectionsToRender().map((s) => s.id);
        body.sections_url = window.location.pathname;
      }
      if (triggerButton) {
        triggerButton.setAttribute('aria-busy', 'true');
        triggerButton.disabled = true;
      }
      try {
        const response = await fetch(`${(window.routes && window.routes.cart_add_url) || '/cart/add'}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok || data.status) {
          throw new Error(data.description || data.message || 'No se pudo añadir al carrito');
        }
        if (cartDrawer && data.sections && typeof cartDrawer.renderContents === 'function') {
          cartDrawer.classList.remove('is-empty');
          cartDrawer.renderContents(data);
          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: 'copo', cartData: data });
          }
        } else {
          window.location.href = (window.routes && window.routes.cart_url) || '/cart';
        }
        return data;
      } finally {
        if (triggerButton) {
          triggerButton.removeAttribute('aria-busy');
          triggerButton.disabled = false;
        }
      }
    },
  };
  window.CopoCart = CopoCart;

  const showError = (container, message) => {
    const el = container && container.querySelector('[data-copo-error]');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  };

  /* ---------- Antes / después ---------- */
  class CopoCompare extends HTMLElement {
    connectedCallback() {
      this.range = this.querySelector('input[type="range"]');
      if (!this.range) return;
      const update = () => this.style.setProperty('--copo-pos', `${this.range.value}%`);
      this.range.addEventListener('input', update);
      update();

      // Arrastre con ratón o dedo (el input range queda para teclado y lectores de pantalla).
      const setFromEvent = (event) => {
        const rect = this.getBoundingClientRect();
        const pct = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
        this.range.value = String(Math.round(pct));
        update();
      };
      let dragging = false;
      this.addEventListener('pointerdown', (event) => {
        dragging = true;
        this.setPointerCapture?.(event.pointerId);
        setFromEvent(event);
      });
      this.addEventListener('pointermove', (event) => dragging && setFromEvent(event));
      const stop = () => (dragging = false);
      this.addEventListener('pointerup', stop);
      this.addEventListener('pointercancel', stop);
    }
  }
  if (!customElements.get('copo-compare')) customElements.define('copo-compare', CopoCompare);

  /* ---------- Añadir rápido (una variante) ---------- */
  class CopoQuickAdd extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector('button[data-variant-id]');
      if (!this.button) return;
      this.button.addEventListener('click', async () => {
        showError(this, '');
        try {
          await CopoCart.add([{ id: Number(this.button.dataset.variantId), quantity: 1 }], this.button);
        } catch (e) {
          showError(this, e.message);
        }
      });
    }
  }
  if (!customElements.get('copo-quick-add')) customElements.define('copo-quick-add', CopoQuickAdd);

  /* ---------- Pack "Completa el ambiente" ---------- */
  class CopoBundle extends HTMLElement {
    connectedCallback() {
      this.inputs = Array.from(this.querySelectorAll('input[type="checkbox"][data-variant-id]'));
      this.totalEl = this.querySelector('[data-copo-total]');
      this.countEl = this.querySelector('[data-copo-count]');
      this.button = this.querySelector('[data-copo-bundle-add]');
      this.formatter = new Intl.NumberFormat(document.documentElement.lang || 'es-ES', {
        style: 'currency',
        currency: this.dataset.currency || 'EUR',
      });
      this.inputs.forEach((i) => i.addEventListener('change', () => this.update()));
      if (this.button) this.button.addEventListener('click', () => this.addSelected());
      this.update();
    }
    selected() {
      return this.inputs.filter((i) => i.checked && !i.disabled);
    }
    update() {
      const selected = this.selected();
      const cents = selected.reduce((sum, i) => sum + Number(i.dataset.price || 0), 0);
      if (this.totalEl) this.totalEl.textContent = this.formatter.format(cents / 100);
      if (this.countEl) this.countEl.textContent = String(selected.length);
      if (this.button) this.button.disabled = selected.length === 0;
      this.inputs.forEach((i) => i.closest('[data-copo-bundle-item]')?.classList.toggle('is-selected', i.checked));
    }
    async addSelected() {
      showError(this, '');
      const items = this.selected().map((i) => ({ id: Number(i.dataset.variantId), quantity: 1 }));
      if (!items.length) return;
      try {
        await CopoCart.add(items, this.button);
      } catch (e) {
        showError(this, e.message);
      }
    }
  }
  if (!customElements.get('copo-bundle')) customElements.define('copo-bundle', CopoBundle);

  /* ---------- Barra fija de compra en móvil (producto) ---------- */
  class CopoStickyAtc extends HTMLElement {
    connectedCallback() {
      // Sección principal de la ficha (Dawn: <product-info id="MainProduct-…">).
      const main = document.querySelector('product-info[id^="MainProduct-"]');
      this.mainButton = main && main.querySelector('[id^="ProductSubmitButton-"]');
      this.priceSource = main && main.querySelector('[id^="price-"]');
      this.priceTarget = this.querySelector('[data-copo-sticky-price]');
      this.button = this.querySelector('button');
      if (!this.mainButton || !this.button) return;

      this.button.addEventListener('click', () => {
        if (this.mainButton.disabled) {
          this.mainButton.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
          return;
        }
        this.mainButton.click();
      });

      this.syncState();
      const observer = new MutationObserver(() => this.syncState());
      observer.observe(this.mainButton, { attributes: true, childList: true, subtree: true, characterData: true });
      if (this.priceSource) {
        observer.observe(this.priceSource, { childList: true, subtree: true, characterData: true });
      }

      const io = new IntersectionObserver(
        ([entry]) => {
          const below = entry.boundingClientRect.top < 0;
          this.toggleAttribute('data-visible', !entry.isIntersecting && below);
        },
        { threshold: 0 }
      );
      io.observe(this.mainButton);
    }
    syncState() {
      const label = this.mainButton.querySelector('span');
      if (label) this.button.querySelector('span').textContent = label.textContent.trim();
      this.button.toggleAttribute('aria-disabled', this.mainButton.disabled);
      if (this.priceSource && this.priceTarget) {
        const onSale = this.priceSource.querySelector('.price--on-sale');
        const current = onSale
          ? onSale.querySelector('.price__sale .price-item--sale')
          : this.priceSource.querySelector('.price__regular .price-item--regular');
        if (current) this.priceTarget.textContent = current.textContent.trim();
      }
    }
  }
  if (!customElements.get('copo-sticky-atc')) customElements.define('copo-sticky-atc', CopoStickyAtc);
})();
