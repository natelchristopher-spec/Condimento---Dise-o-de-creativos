'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import type { LandingCopy } from '@/app/api/generate-landing-copy/route';

type Step = 'producto' | 'merchant' | 'generando' | 'resultado';

interface Testimonial { name: string; quote: string; }

function generateLiquidTemplate(
  copy: LandingCopy,
  brandKit: BrandKit,
  testimonials: Testimonial[],
  whatsappNumber: string,
  shippingText: string,
): string {
  const t1 = testimonials[0] || { name: '', quote: '' };
  const t2 = testimonials[1] || { name: '', quote: '' };
  const t3 = testimonials[2] || { name: '', quote: '' };

  return `{% comment %} Condimento Landing v1 — generado automáticamente {% endcomment %}
<style>
  #c-{{ section.id }} {
    --c-brand: {{ section.settings.brand_color }};
    --c-accent: {{ section.settings.accent_color }};
    --c-bg: #ffffff;
    --c-surface: #f7f7f5;
    --c-border: #e8e8e4;
    --c-text: #1a1a1a;
    --c-muted: #6b6b6b;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    color: var(--c-text);
  }
  #c-{{ section.id }} * { box-sizing: border-box; margin: 0; padding: 0; }
  #c-{{ section.id }} a { color: inherit; text-decoration: none; }
  #c-{{ section.id }} img { max-width: 100%; height: auto; display: block; }

  /* Hero */
  .c-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; padding: 48px 5%; max-width: 1200px; margin: 0 auto; }
  @media (max-width: 768px) { .c-hero { grid-template-columns: 1fr; gap: 24px; padding: 16px 4% 24px; } }

  /* Gallery */
  .c-gallery__main { position: relative; background: var(--c-surface); border-radius: 12px; overflow: hidden; aspect-ratio: 1/1; min-height: 280px; }
  .c-gallery__main img { width: 100%; height: 100%; object-fit: contain; display: none; }
  .c-gallery__main img.is-active { display: block; }
  .c-gallery__thumbs { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .c-thumb { width: 64px; height: 64px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; background: var(--c-surface); padding: 0; }
  .c-thumb.is-active { border-color: var(--c-brand); }
  .c-thumb img { width: 100%; height: 100%; object-fit: contain; }

  /* Product info */
  .c-product-info { display: flex; flex-direction: column; gap: 20px; }
  .c-product-title { font-size: 26px; font-weight: 700; line-height: 1.2; letter-spacing: -0.5px; }
  @media (max-width: 768px) { .c-product-title { font-size: 22px; } }
  .c-price-row { display: flex; align-items: baseline; gap: 12px; }
  .c-price { font-size: 28px; font-weight: 800; color: var(--c-brand); }
  .c-bullets { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .c-bullets li { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; color: var(--c-muted); line-height: 1.4; }
  .c-bullets li::before { content: "✓"; color: var(--c-brand); font-weight: 700; flex-shrink: 0; margin-top: 1px; }

  /* Options */
  .c-option { display: flex; flex-direction: column; gap: 8px; }
  .c-option label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--c-muted); }
  .c-option__values { display: flex; flex-wrap: wrap; gap: 8px; }
  .c-opt-btn { padding: 8px 16px; border: 1.5px solid var(--c-border); border-radius: 8px; background: white; cursor: pointer; font-size: 14px; transition: all 0.15s; }
  .c-opt-btn.is-selected, .c-opt-btn:hover { border-color: var(--c-brand); background: var(--c-brand); color: white; }

  /* ATC Button */
  .c-atc-btn { width: 100%; padding: 16px 24px; background: var(--c-brand); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; letter-spacing: 0.3px; }
  .c-atc-btn:hover { opacity: 0.88; }
  .c-atc-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* WhatsApp */
  .c-wa-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px 24px; background: #25d366; color: white; border-radius: 10px; font-size: 15px; font-weight: 600; transition: opacity 0.15s; }
  .c-wa-btn:hover { opacity: 0.88; }
  .c-wa-btn svg { width: 20px; height: 20px; fill: white; flex-shrink: 0; }

  /* Accordion */
  .c-accordion { border-top: 1px solid var(--c-border); padding-top: 16px; }
  .c-accordion summary { cursor: pointer; font-size: 14px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; user-select: none; }
  .c-accordion summary::-webkit-details-marker { display: none; }
  .c-accordion summary::after { content: "+"; font-size: 20px; font-weight: 300; color: var(--c-muted); }
  .c-accordion[open] summary::after { content: "−"; }
  .c-accordion__body { padding-top: 12px; font-size: 14px; color: var(--c-muted); line-height: 1.7; }
  .c-trust { font-size: 13px; color: var(--c-muted); line-height: 1.5; border-top: 1px solid var(--c-border); padding-top: 16px; }

  /* Sections */
  .c-section { padding: 64px 5%; max-width: 1200px; margin: 0 auto; }
  @media (max-width: 768px) { .c-section { padding: 40px 4%; } }
  .c-section-title { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 40px; letter-spacing: -0.5px; }
  @media (max-width: 768px) { .c-section-title { font-size: 22px; margin-bottom: 28px; } }

  /* Rational */
  .c-section--rational { background: var(--c-surface); }
  .c-specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
  @media (max-width: 600px) { .c-specs-grid { grid-template-columns: 1fr; } }
  .c-spec-card { background: white; border-radius: 12px; padding: 24px; border: 1px solid var(--c-border); }
  .c-spec-icon { font-size: 24px; display: block; margin-bottom: 10px; }
  .c-spec-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
  .c-spec-text { font-size: 14px; color: var(--c-muted); line-height: 1.5; }
  .c-lifestyle-img { margin-top: 40px; border-radius: 16px; overflow: hidden; max-height: 480px; }
  .c-lifestyle-img img { width: 100%; height: 100%; object-fit: cover; }

  /* Social Proof */
  .c-rating-summary { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 32px; }
  .c-testimonials { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 1024px) { .c-testimonials { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 768px) { .c-testimonials { grid-template-columns: 1fr; } }
  .c-testimonial-card { background: var(--c-surface); border-radius: 12px; padding: 24px; border: 1px solid var(--c-border); }
  .c-stars { color: #f59e0b; font-size: 14px; margin-bottom: 10px; }
  .c-quote { font-size: 14px; line-height: 1.6; color: var(--c-text); margin-bottom: 12px; font-style: italic; }
  .c-author { font-size: 13px; font-weight: 600; color: var(--c-muted); }

  /* FAQ */
  .c-faq-list { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--c-border); border-radius: 12px; overflow: hidden; max-width: 720px; margin: 0 auto; }
  .c-faq-item { border-bottom: 1px solid var(--c-border); }
  .c-faq-item:last-child { border-bottom: none; }
  .c-faq-item summary { cursor: pointer; padding: 18px 20px; font-size: 15px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .c-faq-item summary::-webkit-details-marker { display: none; }
  .c-faq-item summary::after { content: "+"; font-size: 20px; font-weight: 300; color: var(--c-muted); flex-shrink: 0; }
  .c-faq-item[open] summary::after { content: "−"; }
  .c-faq-item__body { padding: 0 20px 18px; font-size: 14px; color: var(--c-muted); line-height: 1.7; }

  /* Final CTA */
  .c-final-cta { text-align: center; background: var(--c-brand); color: white; }
  .c-final-cta .c-section-title { color: white; }
  .c-cta-subtext { font-size: 16px; opacity: 0.85; margin-bottom: 32px; }
  .c-final-cta .c-atc-btn { background: white; color: var(--c-brand); max-width: 360px; margin: 0 auto 16px; }
  .c-final-cta .c-wa-btn { max-width: 360px; margin: 0 auto; background: rgba(255,255,255,0.15); border: 1.5px solid rgba(255,255,255,0.4); }
  .c-guarantee { font-size: 13px; opacity: 0.7; margin-top: 16px; }

  /* Sticky bar */
  .c-sticky { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid var(--c-border); padding: 12px 5%; padding-bottom: max(12px, env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 16px; z-index: 100; transform: translateY(100%); transition: transform 0.3s ease; box-shadow: 0 -4px 20px rgba(0,0,0,0.08); }
  .c-sticky.is-visible { transform: translateY(0); }
  .c-sticky__info { flex: 1; min-width: 0; }
  .c-sticky__title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-sticky__price { font-size: 13px; color: var(--c-muted); }
  .c-sticky .c-atc-btn { width: auto; padding: 12px 24px; font-size: 14px; flex-shrink: 0; }
  @media (max-width: 480px) { .c-sticky__info { display: none; } .c-sticky .c-atc-btn { width: 100%; } }
</style>

<div id="c-{{ section.id }}">

  {%- comment -%} ── ZONA 1: HERO ── {%- endcomment -%}
  <div class="c-hero">

    {%- comment -%} Galería de imágenes del producto {%- endcomment -%}
    <div class="c-gallery">
      <div class="c-gallery__main" id="c-gallery-main-{{ section.id }}">
        {% for image in product.images %}
          <img src="{{ image | img_url: '800x' }}" alt="{{ image.alt | default: product.title }}" {% if forloop.first %}class="is-active"{% endif %}>
        {% endfor %}
      </div>
      {% if product.images.size > 1 %}
        <div class="c-gallery__thumbs" id="c-gallery-thumbs-{{ section.id }}">
          {% for image in product.images %}
            <button class="c-thumb {% if forloop.first %}is-active{% endif %}" data-index="{{ forloop.index0 }}" aria-label="Ver imagen {{ forloop.index }}">
              <img src="{{ image | img_url: '120x120' }}" alt="">
            </button>
          {% endfor %}
        </div>
      {% endif %}
    </div>

    {%- comment -%} Info del producto {%- endcomment -%}
    <div class="c-product-info">
      <h1 class="c-product-title">{{ product.title }}</h1>

      <div class="c-price-row">
        <span class="c-price">{{ product.price | money }}</span>
        {% if product.compare_at_price and product.compare_at_price > product.price %}
          <span style="text-decoration:line-through; color:var(--c-muted); font-size:18px;">{{ product.compare_at_price | money }}</span>
        {% endif %}
      </div>

      <ul class="c-bullets">
        {% if section.settings.bullet_1 != blank %}<li>{{ section.settings.bullet_1 }}</li>{% endif %}
        {% if section.settings.bullet_2 != blank %}<li>{{ section.settings.bullet_2 }}</li>{% endif %}
        {% if section.settings.bullet_3 != blank %}<li>{{ section.settings.bullet_3 }}</li>{% endif %}
      </ul>

      {% form 'product', product, id: 'c-form-hero-' | append: section.id %}
        {% unless product.has_only_default_variant %}
          {% for option in product.options_with_values %}
            <div class="c-option">
              <label>{{ option.name }}</label>
              <div class="c-option__values">
                {% for value in option.values %}
                  <button type="button" class="c-opt-btn" data-option-index="{{ option.position | minus: 1 }}" data-value="{{ value }}">{{ value }}</button>
                {% endfor %}
              </div>
            </div>
          {% endfor %}
        {% endunless %}
        <input type="hidden" name="id" id="c-variant-hero-{{ section.id }}" value="{{ product.selected_or_first_available_variant.id }}">
        <button type="submit" class="c-atc-btn" {% unless product.available %}disabled{% endunless %}>
          {% if product.available %}{{ section.settings.atc_text | default: 'Agregar al carrito' }}{% else %}Sin stock{% endif %}
        </button>
      {% endform %}

      {% if section.settings.whatsapp_number != blank %}
        <a class="c-wa-btn" href="https://wa.me/{{ section.settings.whatsapp_number | remove: '+' | remove: ' ' | remove: '-' }}?text={{ section.settings.whatsapp_text | url_encode }}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          {{ section.settings.whatsapp_cta | default: 'Consultar por WhatsApp' }}
        </a>
      {% endif %}

      {% if section.settings.description != blank %}
        <details class="c-accordion">
          <summary>{{ section.settings.description_label | default: 'Descripción del producto' }}</summary>
          <div class="c-accordion__body">{{ section.settings.description }}</div>
        </details>
      {% endif %}

      {% if section.settings.shipping_text != blank %}
        <p class="c-trust">{{ section.settings.shipping_text }}</p>
      {% endif %}
    </div>
  </div>

  {%- comment -%} ── ZONA 2: RACIONAL ── {%- endcomment -%}
  <div class="c-section--rational">
    <div class="c-section">
      {% if section.settings.rational_title != blank %}
        <h2 class="c-section-title">{{ section.settings.rational_title }}</h2>
      {% endif %}
      <div class="c-specs-grid">
        {% for i in (1..4) %}
          {%- assign icon_key = 'spec_' | append: i | append: '_icon' -%}
          {%- assign title_key = 'spec_' | append: i | append: '_title' -%}
          {%- assign text_key = 'spec_' | append: i | append: '_text' -%}
          {% if section.settings[title_key] != blank %}
            <div class="c-spec-card">
              <span class="c-spec-icon">{{ section.settings[icon_key] | default: '✓' }}</span>
              <p class="c-spec-title">{{ section.settings[title_key] }}</p>
              <p class="c-spec-text">{{ section.settings[text_key] }}</p>
            </div>
          {% endif %}
        {% endfor %}
      </div>
      {% if section.settings.lifestyle_image != blank %}
        <div class="c-lifestyle-img">
          <img src="{{ section.settings.lifestyle_image | img_url: '1200x' }}" alt="{{ section.settings.lifestyle_image.alt | default: product.title }}">
        </div>
      {% endif %}
    </div>
  </div>

  {%- comment -%} ── ZONA 3: VALIDACIÓN SOCIAL ── {%- endcomment -%}
  <div class="c-section">
    {% if section.settings.testimonial_rating != blank %}
      <p class="c-rating-summary">{{ section.settings.testimonial_rating }}</p>
    {% endif %}
    <div class="c-testimonials">
      {% for i in (1..3) %}
        {%- assign name_key = 'testimonial_' | append: i | append: '_name' -%}
        {%- assign quote_key = 'testimonial_' | append: i | append: '_quote' -%}
        {% if section.settings[name_key] != blank %}
          <div class="c-testimonial-card">
            <div class="c-stars">★★★★★</div>
            <p class="c-quote">"{{ section.settings[quote_key] }}"</p>
            <span class="c-author">— {{ section.settings[name_key] }}</span>
          </div>
        {% endif %}
      {% endfor %}
    </div>
  </div>

  {%- comment -%} ── ZONA 4: FAQ ── {%- endcomment -%}
  <div class="c-section--rational">
    <div class="c-section">
      <h2 class="c-section-title">{{ section.settings.faq_title | default: 'Preguntas frecuentes' }}</h2>
      <div class="c-faq-list">
        {% for i in (1..5) %}
          {%- assign q_key = 'faq_' | append: i | append: '_q' -%}
          {%- assign a_key = 'faq_' | append: i | append: '_a' -%}
          {% if section.settings[q_key] != blank %}
            <details class="c-faq-item">
              <summary>{{ section.settings[q_key] }}</summary>
              <div class="c-faq-item__body">{{ section.settings[a_key] }}</div>
            </details>
          {% endif %}
        {% endfor %}
      </div>
    </div>
  </div>

  {%- comment -%} ── ZONA 5: CTA FINAL ── {%- endcomment -%}
  <div class="c-final-cta">
    <div class="c-section">
      {% if section.settings.cta_headline != blank %}
        <h2 class="c-section-title">{{ section.settings.cta_headline }}</h2>
      {% endif %}
      {% if section.settings.cta_subtext != blank %}
        <p class="c-cta-subtext">{{ section.settings.cta_subtext }}</p>
      {% endif %}
      {% form 'product', product, id: 'c-form-cta-' | append: section.id %}
        <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
        <button type="submit" class="c-atc-btn" {% unless product.available %}disabled{% endunless %}>
          {{ section.settings.atc_text | default: 'Agregar al carrito' }}
        </button>
      {% endform %}
      {% if section.settings.whatsapp_number != blank %}
        <a class="c-wa-btn" href="https://wa.me/{{ section.settings.whatsapp_number | remove: '+' | remove: ' ' | remove: '-' }}?text={{ section.settings.whatsapp_text | url_encode }}" target="_blank" rel="noopener" style="margin-top:12px;">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Consultar por WhatsApp
        </a>
      {% endif %}
      {% if section.settings.guarantee_text != blank %}
        <p class="c-guarantee">{{ section.settings.guarantee_text }}</p>
      {% endif %}
    </div>
  </div>

</div>

{%- comment -%} ── STICKY BAR ── {%- endcomment -%}
{% if section.settings.show_sticky_bar %}
<div class="c-sticky" id="c-sticky-{{ section.id }}">
  <div class="c-sticky__info">
    <p class="c-sticky__title">{{ product.title }}</p>
    <p class="c-sticky__price">{{ product.price | money }}</p>
  </div>
  {% form 'product', product, id: 'c-form-sticky-' | append: section.id %}
    <input type="hidden" name="id" id="c-variant-sticky-{{ section.id }}" value="{{ product.selected_or_first_available_variant.id }}">
    <button type="submit" class="c-atc-btn" style="width:auto;padding:12px 24px;font-size:14px;" {% unless product.available %}disabled{% endunless %}>
      Comprar
    </button>
  {% endform %}
</div>
{% endif %}

<script>
(function() {
  var sid = '{{ section.id }}';

  // Gallery
  var mainEl = document.getElementById('c-gallery-main-' + sid);
  var thumbsEl = document.getElementById('c-gallery-thumbs-' + sid);
  if (mainEl && thumbsEl) {
    thumbsEl.addEventListener('click', function(e) {
      var btn = e.target.closest('.c-thumb');
      if (!btn) return;
      var idx = parseInt(btn.dataset.index, 10);
      mainEl.querySelectorAll('img').forEach(function(img, i) {
        img.classList.toggle('is-active', i === idx);
      });
      thumbsEl.querySelectorAll('.c-thumb').forEach(function(t, i) {
        t.classList.toggle('is-active', i === idx);
      });
    });
  }

  // Variant selection
  var heroForm = document.getElementById('c-form-hero-' + sid);
  if (heroForm) {
    var selectedOptions = {};
    heroForm.querySelectorAll('.c-opt-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var optIdx = btn.dataset.optionIndex;
        selectedOptions[optIdx] = btn.dataset.value;
        heroForm.querySelectorAll('[data-option-index="' + optIdx + '"]').forEach(function(b) {
          b.classList.toggle('is-selected', b === btn);
        });
        var variants = {{ product.variants | json }};
        var match = variants.find(function(v) {
          return v.options.every(function(opt, i) {
            return !selectedOptions[i] || selectedOptions[i] === opt;
          });
        });
        if (match) {
          document.getElementById('c-variant-hero-' + sid).value = match.id;
          var stickyV = document.getElementById('c-variant-sticky-' + sid);
          if (stickyV) stickyV.value = match.id;
        }
      });
    });
  }

  // Sticky bar
  var stickyEl = document.getElementById('c-sticky-' + sid);
  if (stickyEl) {
    var heroSection = document.querySelector('#c-' + sid + ' .c-hero');
    var observer = new IntersectionObserver(function(entries) {
      stickyEl.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0.1 });
    if (heroSection) observer.observe(heroSection);
  }
})();
</script>

{% schema %}
{
  "name": "Condimento Landing",
  "tag": "section",
  "class": "condimento-landing-section",
  "settings": [
    {
      "type": "header",
      "content": "Colores de marca"
    },
    {
      "type": "color",
      "id": "brand_color",
      "label": "Color principal",
      "default": "${brandKit.primary1 || '#000000'}"
    },
    {
      "type": "color",
      "id": "accent_color",
      "label": "Color acento",
      "default": "${brandKit.primary2 || '#e42820'}"
    },
    {
      "type": "header",
      "content": "Hero — Above the fold"
    },
    {
      "type": "text",
      "id": "bullet_1",
      "label": "Bullet 1",
      "default": "${copy.bullets[0]}"
    },
    {
      "type": "text",
      "id": "bullet_2",
      "label": "Bullet 2",
      "default": "${copy.bullets[1]}"
    },
    {
      "type": "text",
      "id": "bullet_3",
      "label": "Bullet 3",
      "default": "${copy.bullets[2]}"
    },
    {
      "type": "text",
      "id": "atc_text",
      "label": "Texto botón compra",
      "default": "Agregar al carrito"
    },
    {
      "type": "text",
      "id": "whatsapp_number",
      "label": "Número WhatsApp (con código de país)",
      "default": "${whatsappNumber}",
      "info": "Ejemplo: 5491122334455"
    },
    {
      "type": "text",
      "id": "whatsapp_cta",
      "label": "Texto botón WhatsApp",
      "default": "Consultar por WhatsApp"
    },
    {
      "type": "text",
      "id": "whatsapp_text",
      "label": "Mensaje pre-cargado WhatsApp",
      "default": "${copy.whatsapp_text}"
    },
    {
      "type": "richtext",
      "id": "description",
      "label": "Descripción del producto",
      "default": "<p>${copy.description}</p>"
    },
    {
      "type": "text",
      "id": "description_label",
      "label": "Título del acordeón de descripción",
      "default": "Descripción del producto"
    },
    {
      "type": "text",
      "id": "shipping_text",
      "label": "Texto de envío y garantía",
      "default": "${shippingText || '🚚 Envío a todo el país  •  🔄 Devolución sin preguntas'}"
    },
    {
      "type": "header",
      "content": "Sección Racional"
    },
    {
      "type": "text",
      "id": "rational_title",
      "label": "Título sección racional",
      "default": "${copy.rational_title}"
    },
    {
      "type": "text",
      "id": "spec_1_icon",
      "label": "Ícono spec 1",
      "default": "${copy.specs[0]?.icon || '✓'}"
    },
    {
      "type": "text",
      "id": "spec_1_title",
      "label": "Título spec 1",
      "default": "${copy.specs[0]?.title || ''}"
    },
    {
      "type": "text",
      "id": "spec_1_text",
      "label": "Texto spec 1",
      "default": "${copy.specs[0]?.text || ''}"
    },
    {
      "type": "text",
      "id": "spec_2_icon",
      "label": "Ícono spec 2",
      "default": "${copy.specs[1]?.icon || '✓'}"
    },
    {
      "type": "text",
      "id": "spec_2_title",
      "label": "Título spec 2",
      "default": "${copy.specs[1]?.title || ''}"
    },
    {
      "type": "text",
      "id": "spec_2_text",
      "label": "Texto spec 2",
      "default": "${copy.specs[1]?.text || ''}"
    },
    {
      "type": "text",
      "id": "spec_3_icon",
      "label": "Ícono spec 3",
      "default": "${copy.specs[2]?.icon || '✓'}"
    },
    {
      "type": "text",
      "id": "spec_3_title",
      "label": "Título spec 3",
      "default": "${copy.specs[2]?.title || ''}"
    },
    {
      "type": "text",
      "id": "spec_3_text",
      "label": "Texto spec 3",
      "default": "${copy.specs[2]?.text || ''}"
    },
    {
      "type": "text",
      "id": "spec_4_icon",
      "label": "Ícono spec 4",
      "default": "${copy.specs[3]?.icon || '✓'}"
    },
    {
      "type": "text",
      "id": "spec_4_title",
      "label": "Título spec 4",
      "default": "${copy.specs[3]?.title || ''}"
    },
    {
      "type": "text",
      "id": "spec_4_text",
      "label": "Texto spec 4",
      "default": "${copy.specs[3]?.text || ''}"
    },
    {
      "type": "image_picker",
      "id": "lifestyle_image",
      "label": "Imagen de contexto / lifestyle"
    },
    {
      "type": "header",
      "content": "Testimonios"
    },
    {
      "type": "text",
      "id": "testimonial_rating",
      "label": "Texto de rating general",
      "default": "${copy.testimonial_rating}"
    },
    {
      "type": "text",
      "id": "testimonial_1_name",
      "label": "Testimonio 1 — Nombre",
      "default": "${t1.name}"
    },
    {
      "type": "textarea",
      "id": "testimonial_1_quote",
      "label": "Testimonio 1 — Texto",
      "default": "${t1.quote}"
    },
    {
      "type": "text",
      "id": "testimonial_2_name",
      "label": "Testimonio 2 — Nombre",
      "default": "${t2.name}"
    },
    {
      "type": "textarea",
      "id": "testimonial_2_quote",
      "label": "Testimonio 2 — Texto",
      "default": "${t2.quote}"
    },
    {
      "type": "text",
      "id": "testimonial_3_name",
      "label": "Testimonio 3 — Nombre",
      "default": "${t3.name}"
    },
    {
      "type": "textarea",
      "id": "testimonial_3_quote",
      "label": "Testimonio 3 — Texto",
      "default": "${t3.quote}"
    },
    {
      "type": "header",
      "content": "FAQ"
    },
    {
      "type": "text",
      "id": "faq_title",
      "label": "Título sección FAQ",
      "default": "Preguntas frecuentes"
    },
    {
      "type": "text",
      "id": "faq_1_q",
      "label": "Pregunta 1",
      "default": "${copy.faq[0]?.q || ''}"
    },
    {
      "type": "textarea",
      "id": "faq_1_a",
      "label": "Respuesta 1",
      "default": "${copy.faq[0]?.a || ''}"
    },
    {
      "type": "text",
      "id": "faq_2_q",
      "label": "Pregunta 2",
      "default": "${copy.faq[1]?.q || ''}"
    },
    {
      "type": "textarea",
      "id": "faq_2_a",
      "label": "Respuesta 2",
      "default": "${copy.faq[1]?.a || ''}"
    },
    {
      "type": "text",
      "id": "faq_3_q",
      "label": "Pregunta 3",
      "default": "${copy.faq[2]?.q || ''}"
    },
    {
      "type": "textarea",
      "id": "faq_3_a",
      "label": "Respuesta 3",
      "default": "${copy.faq[2]?.a || ''}"
    },
    {
      "type": "text",
      "id": "faq_4_q",
      "label": "Pregunta 4",
      "default": "${copy.faq[3]?.q || ''}"
    },
    {
      "type": "textarea",
      "id": "faq_4_a",
      "label": "Respuesta 4",
      "default": "${copy.faq[3]?.a || ''}"
    },
    {
      "type": "text",
      "id": "faq_5_q",
      "label": "Pregunta 5",
      "default": "${copy.faq[4]?.q || ''}"
    },
    {
      "type": "textarea",
      "id": "faq_5_a",
      "label": "Respuesta 5",
      "default": "${copy.faq[4]?.a || ''}"
    },
    {
      "type": "header",
      "content": "CTA Final"
    },
    {
      "type": "text",
      "id": "cta_headline",
      "label": "Headline CTA final",
      "default": "${copy.cta_headline}"
    },
    {
      "type": "text",
      "id": "cta_subtext",
      "label": "Subtexto CTA final",
      "default": "${copy.cta_subtext}"
    },
    {
      "type": "text",
      "id": "guarantee_text",
      "label": "Texto de garantía",
      "default": ""
    },
    {
      "type": "header",
      "content": "Sticky bar"
    },
    {
      "type": "checkbox",
      "id": "show_sticky_bar",
      "label": "Mostrar sticky bar al scrollear",
      "default": true
    }
  ],
  "presets": [
    {
      "name": "Condimento Landing"
    }
  ]
}
{% endschema %}`;
}

export default function LandingBuilderPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [kitLoading, setKitLoading] = useState(true);
  const [step, setStep] = useState<Step>('producto');

  // Step 1 — Producto
  const [brief, setBrief] = useState('');
  const [bullet1, setBullet1] = useState('');
  const [bullet2, setBullet2] = useState('');
  const [bullet3, setBullet3] = useState('');

  // Step 2 — Merchant
  const [whatsapp, setWhatsapp] = useState('');
  const [shipping, setShipping] = useState('🚚 Envío a todo el país  •  🔄 Devolución sin preguntas');
  const [t1, setT1] = useState<Testimonial>({ name: '', quote: '' });
  const [t2, setT2] = useState<Testimonial>({ name: '', quote: '' });
  const [t3, setT3] = useState<Testimonial>({ name: '', quote: '' });

  // Result
  const [copy, setCopy] = useState<LandingCopy | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/brand-kits', { signal: ac.signal }).then(r => r.json()).then(kit => {
      if (kit && !kit.error) setBrandKit(kit);
    }).catch(e => { if (e.name !== 'AbortError') console.error(e); }).finally(() => setKitLoading(false));
    fetch('/api/profile', { signal: ac.signal }).then(r => r.json()).then(d => {
      setHasApiKey(!!d.openai_api_key);
    }).catch(e => { if (e.name !== 'AbortError') setHasApiKey(false); });
    return () => ac.abort();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const generate = async () => {
    if (!brandKit || !brief.trim()) return;
    setStep('generando');
    setError('');
    try {
      const pdpBullets = [bullet1, bullet2, bullet3].filter(Boolean);
      const res = await fetch('/api/generate-landing-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          brandKit,
          pdpBullets,
          whatsappNumber: whatsapp,
          shippingText: shipping,
          testimonials: [t1, t2, t3],
        }),
      });
      let data: { copy?: LandingCopy; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error('Respuesta inesperada del servidor. Intentá de nuevo.');
      }
      if (!res.ok || data.error) throw new Error(data.error || 'Error al generar');
      setCopy(data.copy ?? null);
      setStep('resultado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      setStep('merchant');
    }
  };

  const downloadLiquid = () => {
    if (!copy || !brandKit) return;
    const template = generateLiquidTemplate(copy, brandKit, [t1, t2, t3], whatsapp, shipping);
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'condimento-landing.liquid';
    a.click();
    URL.revokeObjectURL(url);
  };

  const Steps = ['producto', 'merchant', 'resultado'];
  const stepLabels: Record<string, string> = {
    producto: 'Producto',
    merchant: 'Tu tienda',
    generando: 'Generando',
    resultado: 'Resultado',
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar active="/landing-builder" onLogout={handleLogout} />

      <main className="flex-1 md:ml-56 pt-16 md:pt-0">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Landing Builder</h1>
            <p className="text-sm text-gray-500 mt-1">Generá tu template de producto para Shopify</p>
          </div>

          {/* Stepper */}
          {step !== 'generando' && (
            <div className="flex items-center gap-2 mb-8">
              {['producto', 'merchant', 'resultado'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step === s ? 'bg-[#e42820] text-white' :
                    Steps.indexOf(step) > i ? 'bg-gray-900 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>{i + 1}</div>
                  <span className={`text-sm ${step === s ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                    {stepLabels[s]}
                  </span>
                  {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
          )}

          {/* STEP 1 — Producto */}
          {step === 'producto' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
              {!hasApiKey && hasApiKey !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  Configurá tu API key de OpenAI en <a href="/perfil" className="font-semibold underline">Perfil</a> para continuar.
                </div>
              )}
              {kitLoading ? (
                <div className="text-sm text-gray-400">Cargando marca...</div>
              ) : !brandKit ? (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
                  Primero configurá tu marca en <a href="/config" className="font-semibold text-gray-700 underline">Mi marca</a>.
                </div>
              ) : (
                <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: brandKit.primary1 || '#000' }} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{brandKit.name}</p>
                    <p className="text-xs text-gray-400">{brandKit.typography}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Brief del producto *</label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="Describí el producto: qué es, para quién es, qué lo hace diferente, beneficios principales..."
                  rows={5}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Bullets de beneficio
                  <span className="text-xs font-normal text-gray-400 ml-2">Opcional — si ya los generaste en PDP</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">Si los dejás vacíos, la IA los genera desde el brief.</p>
                {[
                  { val: bullet1, set: setBullet1, label: 'Bullet 1' },
                  { val: bullet2, set: setBullet2, label: 'Bullet 2' },
                  { val: bullet3, set: setBullet3, label: 'Bullet 3' },
                ].map(({ val, set, label }) => (
                  <input
                    key={label}
                    value={val}
                    onChange={e => set(e.target.value)}
                    placeholder={label}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820] mb-2"
                  />
                ))}
              </div>

              <button
                onClick={() => setStep('merchant')}
                disabled={!brief.trim() || !brandKit || !hasApiKey}
                className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-gray-800 transition-colors"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* STEP 2 — Merchant */}
          {step === 'merchant' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de WhatsApp</label>
                <input
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="Ej: 5491122334455 (con código de país, sin +)"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Texto de envío y garantía</label>
                <input
                  value={shipping}
                  onChange={e => setShipping(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Testimonios</label>
                <p className="text-xs text-gray-400 mb-3">Nombre real + resultado concreto. No solo estrellas.</p>
                {[
                  { t: t1, set: setT1, n: 1 },
                  { t: t2, set: setT2, n: 2 },
                  { t: t3, set: setT3, n: 3 },
                ].map(({ t, set, n }) => (
                  <div key={n} className="border border-gray-100 rounded-xl p-4 mb-3 space-y-2">
                    <input
                      value={t.name}
                      onChange={e => set(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={`Nombre ${n} — ej: "María L., Colombia"`}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                    />
                    <textarea
                      value={t.quote}
                      onChange={e => set(prev => ({ ...prev, quote: e.target.value }))}
                      placeholder={`Testimonio ${n} — ej: "Lo uso hace 3 semanas y ya noto la diferencia. Lo recomiendo 100%."`}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('producto')}
                  className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ← Volver
                </button>
                <button
                  onClick={generate}
                  className="flex-1 py-3 bg-[#e42820] text-white rounded-xl text-sm font-semibold hover:bg-[#c92218] transition-colors"
                >
                  Generar landing →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Generando */}
          {step === 'generando' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-12 h-12 rounded-full border-2 border-[#e42820] border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-sm font-semibold text-gray-700">Generando copy de la landing...</p>
              <p className="text-xs text-gray-400 mt-2">Headline, descripción, specs, FAQ y CTA en español</p>
            </div>
          )}

          {/* STEP 4 — Resultado */}
          {step === 'resultado' && copy && brandKit && (
            <div className="space-y-4">

              {/* Download */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Template listo</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Descargá el archivo <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.liquid</code> y subilo a tu tema de Shopify en
                      {' '}<strong>Online Store → Themes → Edit code → Sections</strong>.
                      Luego agregalo a tu product page desde el Theme Editor.
                    </p>
                  </div>
                  <button
                    onClick={downloadLiquid}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar .liquid
                  </button>
                </div>
              </div>

              {/* Preview del copy generado */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Preview del copy generado</h3>

                <div className="space-y-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Headline</p>
                  <p className="text-xl font-bold text-gray-900">{copy.headline}</p>
                  <p className="text-sm text-gray-500">{copy.subheadline}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Bullets</p>
                  <ul className="space-y-1.5">
                    {copy.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-[#e42820] font-bold mt-0.5">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Descripción</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{copy.description}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{copy.rational_title}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {copy.specs.map((spec, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <span className="text-lg">{spec.icon}</span>
                        <p className="text-sm font-semibold text-gray-800 mt-1">{spec.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{spec.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">FAQ</p>
                  <div className="space-y-2">
                    {copy.faq.map((item, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3">
                        <p className="text-sm font-semibold text-gray-800">{item.q}</p>
                        <p className="text-xs text-gray-500 mt-1">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <p className="text-base font-bold text-gray-900">{copy.cta_headline}</p>
                  <p className="text-sm text-gray-500 mt-1">{copy.cta_subtext}</p>
                </div>
              </div>

              <button
                onClick={() => { setStep('producto'); setCopy(null); }}
                className="w-full py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Generar otra landing
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
