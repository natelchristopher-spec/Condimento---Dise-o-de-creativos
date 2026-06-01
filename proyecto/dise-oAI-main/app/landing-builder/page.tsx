'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import type { LandingCopy } from '@/app/api/generate-landing-copy/route';

type Step = 'produto' | 'merchant' | 'generando' | 'resultado';

interface Testimonial { name: string; quote: string; }

function generateLiquidTemplate(
  copy: LandingCopy,
  brandKit: BrandKit,
  whatsappNumber: string,
  shippingText: string,
): string {
  return `{% comment %} Condimento Landing v2 — generado por Condimento {% endcomment %}
<style>
  #c-{{ section.id }} {
    --c-brand: {{ section.settings.brand_color }};
    --c-accent: {{ section.settings.accent_color }};
    --c-bg: #ffffff;
    --c-surface: #f7f7f5;
    --c-border: #e8e8e4;
    --c-text: #1a1a1a;
    --c-muted: #6b6b6b;
    --c-success: #2b6636;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    color: var(--c-text);
  }
  #c-{{ section.id }} *, #c-{{ section.id }} *::before, #c-{{ section.id }} *::after { box-sizing: border-box; margin: 0; padding: 0; }
  #c-{{ section.id }} a { color: inherit; text-decoration: none; }
  #c-{{ section.id }} img { max-width: 100%; height: auto; display: block; }

  /* Hero */
  .c-hero { display: grid; grid-template-columns: 55% 1fr; gap: 56px; padding: 48px 5% 72px; max-width: 1240px; margin: 0 auto; align-items: start; }
  @media (max-width: 860px) { .c-hero { grid-template-columns: 1fr; gap: 28px; padding: 24px 4% 48px; } }

  /* Gallery */
  .c-gallery { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 80px; }
  @media (max-width: 860px) { .c-gallery { position: static; } }
  .c-gallery__main { background: var(--c-surface); border-radius: 20px; overflow: hidden; aspect-ratio: 1/1; min-height: 280px; position: relative; }
  .c-gallery__main img { width: 100%; height: 100%; object-fit: contain; display: none; }
  .c-gallery__main img.is-active { display: block; }
  .c-gallery__thumbs { display: flex; gap: 10px; flex-wrap: wrap; }
  .c-thumb { width: 68px; height: 68px; border-radius: 12px; overflow: hidden; cursor: pointer; border: 2px solid transparent; background: var(--c-surface); padding: 0; transition: border-color .15s; }
  .c-thumb.is-active { border-color: var(--c-brand); }
  .c-thumb img { width: 100%; height: 100%; object-fit: contain; }

  /* Product info */
  .c-product-info { display: flex; flex-direction: column; gap: 22px; padding-top: 8px; }
  .c-review-line { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--c-muted); }
  .c-stars { color: #e8a920; letter-spacing: 2px; }
  .c-product-title { font-size: 28px; font-weight: 700; line-height: 1.15; letter-spacing: -.5px; }
  @media (max-width: 860px) { .c-product-title { font-size: 22px; } }
  .c-price-row { display: flex; align-items: baseline; gap: 12px; }
  .c-price { font-size: 28px; font-weight: 800; color: var(--c-brand); }
  .c-price-compare { font-size: 18px; color: var(--c-muted); text-decoration: line-through; }
  .c-bullets { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .c-bullets li { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; color: var(--c-muted); line-height: 1.5; }
  .c-bullets li::before { content: "✓"; color: var(--c-brand); font-weight: 700; flex-shrink: 0; margin-top: 1px; }

  /* Variant options */
  .c-option { display: flex; flex-direction: column; gap: 8px; }
  .c-option label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--c-muted); }
  .c-option__values { display: flex; flex-wrap: wrap; gap: 8px; }
  .c-opt-btn { padding: 9px 18px; border: 1.5px solid var(--c-border); border-radius: 9px; background: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.15s; }
  .c-opt-btn.is-selected, .c-opt-btn:hover { border-color: var(--c-brand); background: var(--c-brand); color: white; }

  /* ATC */
  .c-atc-btn { width: 100%; padding: 17px 24px; background: var(--c-brand); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; letter-spacing: 0.2px; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
  .c-atc-btn:hover { opacity: 0.88; }
  .c-atc-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* WhatsApp */
  .c-wa-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px 24px; background: #25d366; color: white; border-radius: 10px; font-size: 15px; font-weight: 600; transition: opacity 0.15s; }
  .c-wa-btn:hover { opacity: 0.88; }
  .c-wa-btn svg { width: 20px; height: 20px; fill: white; flex-shrink: 0; }

  /* Trust */
  .c-trust { display: flex; flex-direction: column; gap: 7px; border-top: 1px solid var(--c-border); padding-top: 16px; }
  .c-trust-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--c-muted); }

  /* Description accordion */
  .c-accordion { border-top: 1px solid var(--c-border); padding-top: 16px; }
  .c-accordion summary { cursor: pointer; font-size: 14px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  .c-accordion summary::-webkit-details-marker { display: none; }
  .c-accordion summary::after { content: "+"; font-size: 20px; font-weight: 300; color: var(--c-muted); }
  .c-accordion[open] summary::after { content: "−"; }
  .c-accordion__body { padding-top: 12px; font-size: 14px; color: var(--c-muted); line-height: 1.7; }

  /* Sections layout */
  .c-section { padding: 72px 5%; max-width: 1200px; margin: 0 auto; }
  .c-section--surface { background: var(--c-surface); }
  .c-section--dark { background: var(--c-brand); color: #fff; }
  @media (max-width: 860px) { .c-section { padding: 48px 4%; } }
  .c-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--c-muted); margin-bottom: 12px; display: block; }
  .c-section--dark .c-eyebrow { color: rgba(255,255,255,.5); }
  .c-section-title { font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -.5px; margin-bottom: 16px; }
  .c-section--dark .c-section-title { color: #fff; }
  @media (max-width: 860px) { .c-section-title { font-size: 24px; } }
  .c-section-sub { font-size: 16px; color: var(--c-muted); max-width: 560px; line-height: 1.7; }
  .c-section--dark .c-section-sub { color: rgba(255,255,255,.6); }

  /* Specs grid */
  .c-specs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5px; background: var(--c-border); border: 1.5px solid var(--c-border); border-radius: 14px; overflow: hidden; margin-top: 40px; box-shadow: 0 2px 12px rgba(0,0,0,.07); }
  @media (max-width: 600px) { .c-specs-grid { grid-template-columns: repeat(2, 1fr); } }
  .c-spec-item { background: var(--c-bg); padding: 22px 20px; }
  .c-spec-key { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--c-muted); margin-bottom: 8px; }
  .c-spec-val { font-size: 15px; font-weight: 700; }

  /* Badges */
  .c-badges { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 40px; }
  .c-badge { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--c-border); border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 600; background: var(--c-bg); box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .c-badge-icon { font-size: 16px; }

  /* Ingredients */
  .c-ing-list { display: flex; flex-direction: column; gap: 10px; margin-top: 40px; max-width: 820px; }
  .c-ing-card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; overflow: hidden; }
  .c-ing-header { display: flex; align-items: center; gap: 18px; padding: 18px 22px; cursor: pointer; }
  .c-ing-icon { width: 56px; height: 56px; border-radius: 12px; background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
  .c-ing-meta { flex: 1; }
  .c-ing-name { font-size: 15px; font-weight: 700; color: #fff; }
  .c-ing-dose { font-size: 13px; color: rgba(255,255,255,.55); margin-top: 2px; }
  .c-ing-toggle { color: rgba(255,255,255,.4); font-size: 22px; font-weight: 300; transition: transform .2s; }
  .c-ing-card[open] .c-ing-toggle, .c-ing-card.is-open .c-ing-toggle { transform: rotate(45deg); color: rgba(255,255,255,.8); }
  .c-ing-body { display: none; padding: 0 22px 20px 96px; font-size: 14px; color: rgba(255,255,255,.7); line-height: 1.75; border-top: 1px solid rgba(255,255,255,.08); padding-top: 0; }
  .c-ing-card.is-open .c-ing-body { display: block; padding-top: 14px; }

  /* Timeline */
  .c-timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5px; background: var(--c-border); border: 1.5px solid var(--c-border); border-radius: 18px; overflow: hidden; margin-top: 40px; box-shadow: 0 2px 12px rgba(0,0,0,.07); }
  @media (max-width: 700px) { .c-timeline { grid-template-columns: 1fr; } }
  .c-tl-item { background: var(--c-bg); padding: 32px 28px; position: relative; }
  .c-tl-item::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--c-accent); opacity: 0.4; }
  .c-tl-item:last-child::before { opacity: 1; }
  .c-tl-when { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--c-accent); background: rgba(0,0,0,.04); padding: 4px 12px; border-radius: 20px; margin-bottom: 14px; }
  .c-tl-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .c-tl-text { font-size: 14px; color: var(--c-muted); line-height: 1.65; }

  /* Comparison */
  .c-comparison-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 40px; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--c-border); box-shadow: 0 2px 12px rgba(0,0,0,.07); }
  .c-comparison-table thead { background: #f2f2ef; }
  .c-comparison-table th { padding: 16px 22px; text-align: left; font-size: 14px; font-weight: 600; color: var(--c-muted); border-bottom: 1.5px solid var(--c-border); }
  .c-comparison-table th.c-col-brand { color: var(--c-brand); font-weight: 800; font-size: 15px; }
  .c-comparison-table th:not(:first-child), .c-comparison-table td:not(:first-child) { text-align: center; }
  .c-comparison-table td { padding: 13px 22px; font-size: 14px; border-bottom: 1px solid var(--c-border); background: var(--c-bg); }
  .c-comparison-table td.c-col-brand-cell { background: #fafaf7; font-weight: 600; }
  .c-comparison-table tr:last-child td { border-bottom: none; }
  .c-check { color: var(--c-success); font-weight: 700; }
  .c-cross { color: #ccc; }

  /* Reviews */
  .c-reviews-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 40px; }
  @media (max-width: 860px) { .c-reviews-grid { grid-template-columns: 1fr; } }
  .c-review-card { background: var(--c-surface); border-radius: 14px; padding: 22px; border: 1.5px solid var(--c-border); display: flex; flex-direction: column; gap: 10px; }
  .c-review-top { display: flex; align-items: center; gap: 10px; }
  .c-review-avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--c-brand); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; flex-shrink: 0; }
  .c-review-meta strong { font-size: 14px; display: block; }
  .c-review-meta span { font-size: 12px; color: var(--c-muted); }
  .c-review-stars { color: #e8a920; font-size: 13px; }
  .c-review-title { font-size: 14px; font-weight: 700; }
  .c-review-text { font-size: 13px; color: #555; line-height: 1.65; }
  .c-review-big { font-size: 64px; font-weight: 900; line-height: 1; letter-spacing: -3px; }
  .c-rating-row { display: flex; align-items: baseline; gap: 16px; padding-bottom: 28px; border-bottom: 1.5px solid var(--c-border); margin-bottom: 0; }
  .c-rating-summary { font-size: 14px; color: var(--c-muted); font-weight: 500; }

  /* FAQ */
  .c-faq-list { max-width: 720px; margin: 40px auto 0; display: flex; flex-direction: column; gap: 8px; }
  .c-faq-item { background: var(--c-bg); border: 1.5px solid var(--c-border); border-radius: 12px; overflow: hidden; }
  .c-faq-q { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; cursor: pointer; font-size: 15px; font-weight: 600; gap: 16px; transition: background .15s; }
  .c-faq-q:hover { background: var(--c-surface); }
  .c-faq-toggle { width: 28px; height: 28px; border-radius: 50%; background: var(--c-surface); color: var(--c-muted); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 300; flex-shrink: 0; transition: transform .2s, background .15s; }
  .c-faq-item.is-open .c-faq-toggle { transform: rotate(45deg); background: var(--c-brand); color: #fff; }
  .c-faq-a { display: none; padding: 0 20px 16px; font-size: 14px; color: var(--c-muted); line-height: 1.7; }
  .c-faq-item.is-open .c-faq-a { display: block; }

  /* Final CTA */
  .c-final-cta { background: var(--c-brand); color: white; }
  .c-final-cta .c-section-title { color: white; }
  .c-cta-subtext { font-size: 16px; opacity: 0.85; margin-bottom: 28px; }
  .c-final-cta .c-atc-btn { background: white; color: var(--c-brand); max-width: 360px; margin: 0 auto 12px; box-shadow: 0 4px 20px rgba(0,0,0,.2); }
  .c-final-cta .c-wa-btn { max-width: 360px; margin: 0 auto; background: rgba(255,255,255,.12); border: 1.5px solid rgba(255,255,255,.3); }
  .c-guarantee { font-size: 13px; opacity: 0.55; margin-top: 16px; text-align: center; }

  /* Sticky bar */
  .c-sticky { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); border-top: 1px solid var(--c-border); padding: 12px 5%; padding-bottom: max(12px, env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 16px; z-index: 100; transform: translateY(100%); transition: transform 0.3s ease; box-shadow: 0 -4px 24px rgba(0,0,0,.07); }
  .c-sticky.is-visible { transform: translateY(0); }
  .c-sticky__info { flex: 1; min-width: 0; }
  .c-sticky__title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-sticky__price { font-size: 13px; color: var(--c-muted); }
  .c-sticky .c-atc-btn { width: auto; padding: 12px 24px; font-size: 14px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
  @media (max-width: 480px) { .c-sticky__info { display: none; } .c-sticky .c-atc-btn { width: 100%; } }
</style>

<div id="c-{{ section.id }}">

  {%- comment -%} HERO {%- endcomment -%}
  <div class="c-hero">
    <div class="c-gallery">
      <div class="c-gallery__main" id="c-gallery-main-{{ section.id }}">
        {% for image in product.images %}
          <img src="{{ image | image_url: width: 800 }}" alt="{{ image.alt | default: product.title }}" {% if forloop.first %}class="is-active"{% endif %}>
        {% endfor %}
      </div>
      {% if product.images.size > 1 %}
        <div class="c-gallery__thumbs" id="c-gallery-thumbs-{{ section.id }}">
          {% for image in product.images %}
            <button class="c-thumb {% if forloop.first %}is-active{% endif %}" data-index="{{ forloop.index0 }}" aria-label="Ver imagen {{ forloop.index }}">
              <img src="{{ image | image_url: width: 120 }}" alt="">
            </button>
          {% endfor %}
        </div>
      {% endif %}
    </div>

    <div class="c-product-info">
      {% if section.settings.rating_summary != blank %}
        <div class="c-review-line"><span class="c-stars">★★★★★</span> <span>{{ section.settings.rating_summary }}</span></div>
      {% endif %}
      <h1 class="c-product-title">{{ product.title }}</h1>
      <div class="c-price-row">
        <span class="c-price">{{ product.price | money }}</span>
        {% if product.compare_at_price and product.compare_at_price > product.price %}
          <span class="c-price-compare">{{ product.compare_at_price | money }}</span>
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
        <a class="c-wa-btn" href="https://wa.me/{{ section.settings.whatsapp_number | remove: '+' | remove: ' ' | remove: '-' }}?text={{ section.settings.whatsapp_text | url_encode | replace: '+', '%20' }}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
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
        <div class="c-trust">
          {% assign trust_items = section.settings.shipping_text | split: '•' %}
          {% for item in trust_items %}
            {% if item != blank %}<div class="c-trust-item">{{ item | strip }}</div>{% endif %}
          {% endfor %}
        </div>
      {% endif %}
    </div>
  </div>

  {%- comment -%} SPECS {%- endcomment -%}
  {% if section.settings.show_specs %}
  <div class="c-section--surface">
    <div class="c-section">
      <span class="c-eyebrow">{{ section.settings.specs_eyebrow }}</span>
      {% if section.settings.specs_title != blank %}<h2 class="c-section-title">{{ section.settings.specs_title }}</h2>{% endif %}
      {% assign spec_blocks = section.blocks | where: 'type', 'spec' %}
      {% if spec_blocks.size > 0 %}
        <div class="c-specs-grid">
          {% for block in spec_blocks %}
            <div class="c-spec-item" {{ block.shopify_attributes }}>
              <div class="c-spec-key">{{ block.settings.spec_key }}</div>
              <div class="c-spec-val">{{ block.settings.spec_value }}</div>
            </div>
          {% endfor %}
        </div>
      {% endif %}
      {% assign badge_blocks = section.blocks | where: 'type', 'badge' %}
      {% if badge_blocks.size > 0 %}
        <div class="c-badges">
          {% for block in badge_blocks %}
            <div class="c-badge" {{ block.shopify_attributes }}>
              <span class="c-badge-icon">{{ block.settings.badge_icon }}</span>
              {{ block.settings.badge_label }}
            </div>
          {% endfor %}
        </div>
      {% endif %}
    </div>
  </div>
  {% endif %}

  {%- comment -%} INGREDIENTS / COMPONENTS {%- endcomment -%}
  {% if section.settings.show_ingredients %}
  {% assign ing_blocks = section.blocks | where: 'type', 'ingredient' %}
  {% if ing_blocks.size > 0 %}
  <div class="c-section--dark">
    <div class="c-section">
      <span class="c-eyebrow">{{ section.settings.ingredients_eyebrow }}</span>
      {% if section.settings.ingredients_title != blank %}<h2 class="c-section-title">{{ section.settings.ingredients_title }}</h2>{% endif %}
      <div class="c-ing-list">
        {% for block in ing_blocks %}
          <div class="c-ing-card" {{ block.shopify_attributes }}>
            <div class="c-ing-header" role="button" tabindex="0">
              <div class="c-ing-icon">{{ block.settings.ing_icon }}</div>
              <div class="c-ing-meta">
                <div class="c-ing-name">{{ block.settings.ing_name }}</div>
                {% if block.settings.ing_dose != blank %}<div class="c-ing-dose">{{ block.settings.ing_dose }}</div>{% endif %}
              </div>
              <span class="c-ing-toggle">+</span>
            </div>
            <div class="c-ing-body">{{ block.settings.ing_description }}</div>
          </div>
        {% endfor %}
      </div>
    </div>
  </div>
  {% endif %}
  {% endif %}

  {%- comment -%} TIMELINE {%- endcomment -%}
  {% if section.settings.show_timeline %}
  {% assign tl_blocks = section.blocks | where: 'type', 'timeline_item' %}
  {% if tl_blocks.size > 0 %}
  <div class="c-section--surface">
    <div class="c-section">
      <span class="c-eyebrow">{{ section.settings.timeline_eyebrow }}</span>
      {% if section.settings.timeline_title != blank %}<h2 class="c-section-title">{{ section.settings.timeline_title }}</h2>{% endif %}
      <div class="c-timeline">
        {% for block in tl_blocks %}
          <div class="c-tl-item" {{ block.shopify_attributes }}>
            <div class="c-tl-when">{{ block.settings.tl_when }}</div>
            <h4 class="c-tl-title">{{ block.settings.tl_title }}</h4>
            <p class="c-tl-text">{{ block.settings.tl_text }}</p>
          </div>
        {% endfor %}
      </div>
    </div>
  </div>
  {% endif %}
  {% endif %}

  {%- comment -%} COMPARISON {%- endcomment -%}
  {% if section.settings.show_comparison %}
  {% assign cr_blocks = section.blocks | where: 'type', 'comparison_row' %}
  {% if cr_blocks.size > 0 %}
  <div>
    <div class="c-section">
      <span class="c-eyebrow">{{ section.settings.comparison_eyebrow }}</span>
      {% if section.settings.comparison_title != blank %}<h2 class="c-section-title">{{ section.settings.comparison_title }}</h2>{% endif %}
      <table class="c-comparison-table">
        <thead>
          <tr>
            <th></th>
            <th class="c-col-brand">{{ section.settings.comparison_brand_col }}</th>
            <th>{{ section.settings.comparison_alt_col }}</th>
          </tr>
        </thead>
        <tbody>
          {% for block in cr_blocks %}
            <tr {{ block.shopify_attributes }}>
              <td>{{ block.settings.cr_label }}</td>
              <td class="c-col-brand-cell">
                {% if block.settings.cr_brand_check %}<span class="c-check">✓</span> {% endif %}{{ block.settings.cr_brand }}
              </td>
              <td>
                {% if block.settings.cr_alt_cross %}<span class="c-cross">✗</span> {% endif %}{{ block.settings.cr_alt }}
              </td>
            </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
  {% endif %}
  {% endif %}

  {%- comment -%} REVIEWS {%- endcomment -%}
  {% if section.settings.show_reviews %}
  {% assign rv_blocks = section.blocks | where: 'type', 'review' %}
  {% if rv_blocks.size > 0 %}
  <div class="c-section--surface">
    <div class="c-section">
      {% if section.settings.rating_summary != blank %}
        <div class="c-rating-row">
          <div class="c-review-big">4.9</div>
          <div>
            <div class="c-stars" style="font-size:20px">★★★★★</div>
            <div class="c-rating-summary">{{ section.settings.rating_summary }}</div>
          </div>
        </div>
      {% endif %}
      <div class="c-reviews-grid">
        {% for block in rv_blocks %}
          <div class="c-review-card" {{ block.shopify_attributes }}>
            <div class="c-review-top">
              <div class="c-review-avatar">{{ block.settings.rv_name | slice: 0 | upcase }}</div>
              <div class="c-review-meta"><strong>{{ block.settings.rv_name }}</strong></div>
            </div>
            <div class="c-review-stars">★★★★★</div>
            {% if block.settings.rv_title != blank %}<div class="c-review-title">{{ block.settings.rv_title }}</div>{% endif %}
            <div class="c-review-text">{{ block.settings.rv_text }}</div>
          </div>
        {% endfor %}
      </div>
    </div>
  </div>
  {% endif %}
  {% endif %}

  {%- comment -%} FAQ {%- endcomment -%}
  {% if section.settings.show_faq %}
  {% assign faq_blocks = section.blocks | where: 'type', 'faq' %}
  {% if faq_blocks.size > 0 %}
  <div>
    <div class="c-section" style="text-align:center">
      <span class="c-eyebrow">{{ section.settings.faq_eyebrow | default: 'FAQ' }}</span>
      {% if section.settings.faq_title != blank %}<h2 class="c-section-title">{{ section.settings.faq_title }}</h2>{% endif %}
    </div>
    <div class="c-faq-list">
      {% for block in faq_blocks %}
        <div class="c-faq-item" {{ block.shopify_attributes }}>
          <div class="c-faq-q" role="button" tabindex="0">
            {{ block.settings.faq_q }}
            <span class="c-faq-toggle">+</span>
          </div>
          <div class="c-faq-a">{{ block.settings.faq_a }}</div>
        </div>
      {% endfor %}
    </div>
  </div>
  {% endif %}
  {% endif %}

  {%- comment -%} FINAL CTA {%- endcomment -%}
  <div class="c-final-cta">
    <div class="c-section" style="text-align:center">
      {% if section.settings.cta_headline != blank %}<h2 class="c-section-title">{{ section.settings.cta_headline }}</h2>{% endif %}
      {% if section.settings.cta_subtext != blank %}<p class="c-cta-subtext">{{ section.settings.cta_subtext }}</p>{% endif %}
      {% form 'product', product, id: 'c-form-cta-' | append: section.id %}
        <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
        <button type="submit" class="c-atc-btn" {% unless product.available %}disabled{% endunless %}>
          {{ section.settings.atc_text | default: 'Agregar al carrito' }}
        </button>
      {% endform %}
      {% if section.settings.whatsapp_number != blank %}
        <a class="c-wa-btn" href="https://wa.me/{{ section.settings.whatsapp_number | remove: '+' | remove: ' ' | remove: '-' }}?text={{ section.settings.whatsapp_text | url_encode | replace: '+', '%20' }}" target="_blank" rel="noopener" style="margin-top:12px">
          <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Consultar por WhatsApp
        </a>
      {% endif %}
      {% if section.settings.guarantee_text != blank %}<p class="c-guarantee">{{ section.settings.guarantee_text }}</p>{% endif %}
    </div>
  </div>

</div>

{%- comment -%} STICKY BAR {%- endcomment -%}
{% if section.settings.show_sticky_bar %}
<div class="c-sticky" id="c-sticky-{{ section.id }}">
  <div class="c-sticky__info">
    <p class="c-sticky__title">{{ product.title }}</p>
    <p class="c-sticky__price">{{ product.price | money }}</p>
  </div>
  {% form 'product', product, id: 'c-form-sticky-' | append: section.id %}
    <input type="hidden" name="id" id="c-variant-sticky-{{ section.id }}" value="{{ product.selected_or_first_available_variant.id }}">
    <button type="submit" class="c-atc-btn" style="width:auto;padding:12px 24px;font-size:14px;" {% unless product.available %}disabled{% endunless %}>Comprar</button>
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
      mainEl.querySelectorAll('img').forEach(function(img, i) { img.classList.toggle('is-active', i === idx); });
      thumbsEl.querySelectorAll('.c-thumb').forEach(function(t, i) { t.classList.toggle('is-active', i === idx); });
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
        heroForm.querySelectorAll('[data-option-index="' + optIdx + '"]').forEach(function(b) { b.classList.toggle('is-selected', b === btn); });
        var variants = {{ product.variants | json }};
        var match = variants.find(function(v) { return v.options.every(function(opt, i) { return !selectedOptions[i] || selectedOptions[i] === opt; }); });
        if (match) {
          document.getElementById('c-variant-hero-' + sid).value = match.id;
          var sv = document.getElementById('c-variant-sticky-' + sid);
          if (sv) sv.value = match.id;
        }
      });
    });
  }

  // Ingredient accordions
  document.querySelectorAll('#c-' + sid + ' .c-ing-header').forEach(function(header) {
    header.addEventListener('click', function() { header.closest('.c-ing-card').classList.toggle('is-open'); });
    header.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); } });
  });

  // FAQ accordions
  document.querySelectorAll('#c-' + sid + ' .c-faq-q').forEach(function(q) {
    q.addEventListener('click', function() { q.closest('.c-faq-item').classList.toggle('is-open'); });
    q.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); } });
  });

  // Sticky bar
  var stickyEl = document.getElementById('c-sticky-' + sid);
  if (stickyEl) {
    var heroSection = document.querySelector('#c-' + sid + ' .c-hero');
    var observer = new IntersectionObserver(function(entries) { stickyEl.classList.toggle('is-visible', !entries[0].isIntersecting); }, { threshold: 0.1 });
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
    { "type": "header", "content": "Colores de marca" },
    { "type": "color", "id": "brand_color", "label": "Color principal", "default": "${brandKit.primary1 || '#1a1a1a'}" },
    { "type": "color", "id": "accent_color", "label": "Color acento", "default": "${brandKit.primary2 || '#e05c00'}" },
    { "type": "header", "content": "Hero" },
    { "type": "text", "id": "bullet_1", "label": "Bullet 1", "default": "${copy.bullets[0]}" },
    { "type": "text", "id": "bullet_2", "label": "Bullet 2", "default": "${copy.bullets[1]}" },
    { "type": "text", "id": "bullet_3", "label": "Bullet 3", "default": "${copy.bullets[2]}" },
    { "type": "text", "id": "atc_text", "label": "Texto botón compra", "default": "Agregar al carrito" },
    { "type": "text", "id": "rating_summary", "label": "Texto de rating", "default": "${copy.rating_summary}" },
    { "type": "text", "id": "whatsapp_number", "label": "Número WhatsApp (con código de país)", "default": "${whatsappNumber}" },
    { "type": "text", "id": "whatsapp_cta", "label": "Texto botón WhatsApp", "default": "Consultar por WhatsApp" },
    { "type": "text", "id": "whatsapp_text", "label": "Mensaje pre-cargado WhatsApp", "default": "${copy.whatsapp_text}" },
    { "type": "richtext", "id": "description", "label": "Descripción del producto", "default": "<p>${copy.description}</p>" },
    { "type": "text", "id": "description_label", "label": "Título acordeón descripción", "default": "Descripción del producto" },
    { "type": "text", "id": "shipping_text", "label": "Texto de envío y garantía", "default": "${shippingText || '🚚 Envío a todo el país  •  🔄 Devolución sin preguntas'}" },
    { "type": "header", "content": "Sección: Especificaciones" },
    { "type": "checkbox", "id": "show_specs", "label": "Mostrar sección", "default": true },
    { "type": "text", "id": "specs_eyebrow", "label": "Etiqueta superior", "default": "Detalles" },
    { "type": "text", "id": "specs_title", "label": "Título de sección", "default": "${copy.specs_title}" },
    { "type": "header", "content": "Sección: Componentes / Ingredientes" },
    { "type": "checkbox", "id": "show_ingredients", "label": "Mostrar sección", "default": true },
    { "type": "text", "id": "ingredients_eyebrow", "label": "Etiqueta superior", "default": "Lo que hay adentro" },
    { "type": "text", "id": "ingredients_title", "label": "Título de sección", "default": "${copy.ingredients_title}" },
    { "type": "header", "content": "Sección: Timeline / Resultados" },
    { "type": "checkbox", "id": "show_timeline", "label": "Mostrar sección", "default": true },
    { "type": "text", "id": "timeline_eyebrow", "label": "Etiqueta superior", "default": "Resultados" },
    { "type": "text", "id": "timeline_title", "label": "Título de sección", "default": "${copy.timeline_title}" },
    { "type": "header", "content": "Sección: Comparativa" },
    { "type": "checkbox", "id": "show_comparison", "label": "Mostrar sección", "default": true },
    { "type": "text", "id": "comparison_eyebrow", "label": "Etiqueta superior", "default": "Comparativa" },
    { "type": "text", "id": "comparison_title", "label": "Título de sección", "default": "${copy.comparison_title}" },
    { "type": "text", "id": "comparison_brand_col", "label": "Columna marca", "default": "${copy.comparison_brand_col}" },
    { "type": "text", "id": "comparison_alt_col", "label": "Columna alternativa", "default": "${copy.comparison_alt_col}" },
    { "type": "header", "content": "Sección: Reseñas" },
    { "type": "checkbox", "id": "show_reviews", "label": "Mostrar sección", "default": true },
    { "type": "header", "content": "Sección: FAQ" },
    { "type": "checkbox", "id": "show_faq", "label": "Mostrar sección", "default": true },
    { "type": "text", "id": "faq_eyebrow", "label": "Etiqueta superior FAQ", "default": "Preguntas frecuentes" },
    { "type": "text", "id": "faq_title", "label": "Título sección FAQ", "default": "Respondemos tus dudas" },
    { "type": "header", "content": "CTA Final" },
    { "type": "text", "id": "cta_headline", "label": "Headline CTA final", "default": "${copy.cta_headline}" },
    { "type": "text", "id": "cta_subtext", "label": "Subtexto CTA final", "default": "${copy.cta_subtext}" },
    { "type": "text", "id": "guarantee_text", "label": "Texto de garantía", "default": "" },
    { "type": "header", "content": "Sticky bar" },
    { "type": "checkbox", "id": "show_sticky_bar", "label": "Mostrar sticky bar al scrollear", "default": true }
  ],
  "blocks": [
    {
      "type": "spec",
      "name": "Especificación",
      "settings": [
        { "type": "text", "id": "spec_key", "label": "Etiqueta" },
        { "type": "text", "id": "spec_value", "label": "Valor" }
      ]
    },
    {
      "type": "badge",
      "name": "Badge de calidad",
      "settings": [
        { "type": "text", "id": "badge_icon", "label": "Emoji" },
        { "type": "text", "id": "badge_label", "label": "Texto" }
      ]
    },
    {
      "type": "ingredient",
      "name": "Componente / Ingrediente",
      "settings": [
        { "type": "text", "id": "ing_icon", "label": "Emoji" },
        { "type": "text", "id": "ing_name", "label": "Nombre" },
        { "type": "text", "id": "ing_dose", "label": "Dosis / subtítulo" },
        { "type": "textarea", "id": "ing_description", "label": "Descripción" }
      ]
    },
    {
      "type": "timeline_item",
      "name": "Resultado / Momento",
      "settings": [
        { "type": "text", "id": "tl_when", "label": "Cuándo" },
        { "type": "text", "id": "tl_title", "label": "Título" },
        { "type": "textarea", "id": "tl_text", "label": "Descripción" }
      ]
    },
    {
      "type": "comparison_row",
      "name": "Fila comparativa",
      "settings": [
        { "type": "text", "id": "cr_label", "label": "Característica" },
        { "type": "text", "id": "cr_brand", "label": "Valor marca" },
        { "type": "checkbox", "id": "cr_brand_check", "label": "Mostrar ✓ para marca", "default": true },
        { "type": "text", "id": "cr_alt", "label": "Valor competencia" },
        { "type": "checkbox", "id": "cr_alt_cross", "label": "Mostrar ✗ para competencia", "default": true }
      ]
    },
    {
      "type": "review",
      "name": "Reseña",
      "settings": [
        { "type": "text", "id": "rv_name", "label": "Nombre" },
        { "type": "text", "id": "rv_title", "label": "Título" },
        { "type": "textarea", "id": "rv_text", "label": "Texto" }
      ]
    },
    {
      "type": "faq",
      "name": "Pregunta frecuente",
      "settings": [
        { "type": "text", "id": "faq_q", "label": "Pregunta" },
        { "type": "textarea", "id": "faq_a", "label": "Respuesta" }
      ]
    }
  ],
  "presets": [{ "name": "Condimento Landing" }]
}
{% endschema %}`;
}

function generateTemplateJson(
  copy: LandingCopy,
  brandKit: BrandKit,
  userReviews: Testimonial[],
  whatsappNumber: string,
  shippingText: string,
): string {
  const blocks: Record<string, { type: string; settings: Record<string, unknown> }> = {};
  const blockOrder: string[] = [];

  const add = (type: string, prefix: string, idx: number, settings: Record<string, unknown>) => {
    const id = `${prefix}-${idx}`;
    blocks[id] = { type, settings };
    blockOrder.push(id);
  };

  copy.specs?.forEach((s, i) => add('spec', 'spec', i, { spec_key: s.key, spec_value: s.value }));
  copy.badges?.forEach((b, i) => add('badge', 'badge', i, { badge_icon: b.icon, badge_label: b.label }));
  copy.ingredients?.forEach((ing, i) => add('ingredient', 'ing', i, { ing_icon: ing.icon, ing_name: ing.name, ing_dose: ing.dose, ing_description: ing.description }));
  copy.timeline?.forEach((tl, i) => add('timeline_item', 'tl', i, { tl_when: tl.when, tl_title: tl.title, tl_text: tl.text }));
  copy.comparison?.forEach((cr, i) => add('comparison_row', 'cr', i, { cr_label: cr.label, cr_brand: cr.brand_value, cr_brand_check: cr.brand_check, cr_alt: cr.alt_value, cr_alt_cross: !cr.alt_check }));

  const finalReviews = userReviews.filter(r => r.name).length > 0
    ? userReviews.filter(r => r.name).map(r => ({ name: r.name, title: '', text: r.quote }))
    : (copy.reviews || []);
  finalReviews.forEach((rv, i) => add('review', 'rv', i, { rv_name: rv.name, rv_title: rv.title, rv_text: rv.text }));

  copy.faq?.forEach((f, i) => add('faq', 'faq', i, { faq_q: f.q, faq_a: f.a }));

  return JSON.stringify({
    sections: {
      'condimento-landing': {
        type: 'condimento-landing',
        settings: {
          brand_color: brandKit.primary1 || '#1a1a1a',
          accent_color: brandKit.primary2 || '#e05c00',
          bullet_1: copy.bullets?.[0] || '',
          bullet_2: copy.bullets?.[1] || '',
          bullet_3: copy.bullets?.[2] || '',
          rating_summary: copy.rating_summary || '',
          whatsapp_number: whatsappNumber || '',
          whatsapp_text: copy.whatsapp_text || '',
          description: `<p>${copy.description || ''}</p>`,
          shipping_text: shippingText || '🚚 Envío a todo el país  •  🔄 Devolución sin preguntas',
          show_specs: true,
          specs_eyebrow: 'Detalles',
          specs_title: copy.specs_title || '',
          show_ingredients: true,
          ingredients_eyebrow: 'Lo que hay adentro',
          ingredients_title: copy.ingredients_title || '',
          show_timeline: true,
          timeline_eyebrow: 'Resultados',
          timeline_title: copy.timeline_title || '',
          show_comparison: true,
          comparison_eyebrow: 'Comparativa',
          comparison_title: copy.comparison_title || '',
          comparison_brand_col: copy.comparison_brand_col || 'Esta Marca',
          comparison_alt_col: copy.comparison_alt_col || 'La competencia',
          show_reviews: true,
          show_faq: true,
          faq_eyebrow: 'Preguntas frecuentes',
          faq_title: 'Respondemos tus dudas',
          cta_headline: copy.cta_headline || '',
          cta_subtext: copy.cta_subtext || '',
          show_sticky_bar: true,
        },
        blocks,
        block_order: blockOrder,
      },
    },
    order: ['condimento-landing'],
  }, null, 2);
}

function generatePreviewHtml(copy: LandingCopy, brandKit: BrandKit, whatsapp: string, shipping: string): string {
  const brand = brandKit.primary1 || '#1a1a1a';
  const accent = brandKit.primary2 || '#e05c00';
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const trustItems = shipping.split('•').filter(Boolean).map(t =>
    `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#6b6b6b;">${esc(t.trim())}</div>`
  ).join('');

  const bulletsHtml = copy.bullets.map(b =>
    `<li style="display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#6b6b6b;line-height:1.5;margin-bottom:8px;"><span style="color:${brand};font-weight:700;flex-shrink:0;">✓</span>${esc(b)}</li>`
  ).join('');

  const specsHtml = (copy.specs || []).map(s =>
    `<div style="background:#fff;padding:22px 20px;"><div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${esc(s.key)}</div><div style="font-size:15px;font-weight:700;">${esc(s.value)}</div></div>`
  ).join('');

  const badgesHtml = (copy.badges || []).map(b =>
    `<div style="display:flex;align-items:center;gap:8px;border:1.5px solid #e8e8e4;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;background:#fff;"><span style="font-size:16px;">${b.icon}</span>${esc(b.label)}</div>`
  ).join('');

  const ingsHtml = (copy.ingredients || []).map(ing =>
    `<div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:18px;padding:18px 22px;">
        <div style="width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${ing.icon}</div>
        <div><div style="font-size:15px;font-weight:700;color:#fff;">${esc(ing.name)}</div><div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:2px;">${esc(ing.dose)}</div></div>
      </div>
      <div style="padding:0 22px 20px 96px;font-size:14px;color:rgba(255,255,255,.7);line-height:1.75;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">${esc(ing.description)}</div>
    </div>`
  ).join('');

  const tlHtml = (copy.timeline || []).map(t =>
    `<div style="background:#fff;padding:32px 28px;position:relative;border-right:1.5px solid #e8e8e4;">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};background:rgba(0,0,0,.04);padding:4px 12px;border-radius:20px;margin-bottom:14px;">${esc(t.when)}</div>
      <h4 style="font-size:16px;font-weight:700;margin:0 0 8px;">${esc(t.title)}</h4>
      <p style="font-size:14px;color:#6b6b6b;line-height:1.65;margin:0;">${esc(t.text)}</p>
    </div>`
  ).join('');

  const cmpRowsHtml = (copy.comparison || []).map(r =>
    `<tr><td style="padding:13px 22px;font-size:14px;border-bottom:1px solid #e8e8e4;">${esc(r.label)}</td>
    <td style="padding:13px 22px;font-size:14px;border-bottom:1px solid #e8e8e4;background:#fafaf7;font-weight:600;text-align:center;">${r.brand_check ? `<span style="color:#2b6636;font-weight:700;">✓</span> ` : ''}${esc(r.brand_value)}</td>
    <td style="padding:13px 22px;font-size:14px;border-bottom:1px solid #e8e8e4;text-align:center;">${!r.alt_check ? `<span style="color:#ccc;">✗</span> ` : ''}${esc(r.alt_value)}</td></tr>`
  ).join('');

  const rvHtml = (copy.reviews || []).map(r =>
    `<div style="background:#f7f7f5;border-radius:14px;padding:22px;border:1.5px solid #e8e8e4;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:38px;height:38px;border-radius:50%;background:${brand};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0;">${esc(r.name.slice(0, 1).toUpperCase())}</div>
        <strong style="font-size:14px;">${esc(r.name)}</strong>
      </div>
      <div style="color:#e8a920;font-size:13px;margin-bottom:6px;">★★★★★</div>
      ${r.title ? `<div style="font-size:14px;font-weight:700;margin-bottom:4px;">${esc(r.title)}</div>` : ''}
      <div style="font-size:13px;color:#555;line-height:1.65;">${esc(r.text)}</div>
    </div>`
  ).join('');

  const faqHtml = (copy.faq || []).map(f =>
    `<div style="background:#fff;border:1.5px solid #e8e8e4;border-radius:12px;overflow:hidden;margin-bottom:8px;padding:18px 20px;">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px;">${esc(f.q)}</div>
      <div style="font-size:14px;color:#6b6b6b;line-height:1.7;">${esc(f.a)}</div>
    </div>`
  ).join('');

  const waBtn = whatsapp ? `<a href="#" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 24px;background:#25d366;color:white;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;margin-top:12px;">
    <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:white;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    Consultar por WhatsApp</a>` : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;}
  a{color:inherit;text-decoration:none;}
</style>
</head><body>

<!-- HERO -->
<div style="display:grid;grid-template-columns:55% 1fr;gap:56px;padding:48px 5% 72px;max-width:1240px;margin:0 auto;align-items:start;">
  <div style="background:#f7f7f5;border-radius:20px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:14px;">📸 Imágenes del producto (Shopify)</div>
  <div style="display:flex;flex-direction:column;gap:22px;padding-top:8px;">
    ${copy.rating_summary ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px;color:#6b6b6b;"><span style="color:#e8a920;letter-spacing:2px;">★★★★★</span> ${esc(copy.rating_summary)}</div>` : ''}
    <h1 style="font-size:28px;font-weight:700;line-height:1.15;letter-spacing:-.5px;">${esc(copy.headline)}</h1>
    <p style="font-size:15px;color:#6b6b6b;">${esc(copy.subheadline)}</p>
    <div style="display:flex;align-items:baseline;gap:12px;"><span style="font-size:28px;font-weight:800;color:${brand};">Precio del producto</span></div>
    <ul style="list-style:none;">${bulletsHtml}</ul>
    <button style="width:100%;padding:17px 24px;background:${brand};color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">Agregar al carrito</button>
    ${waBtn}
    ${shipping ? `<div style="display:flex;flex-direction:column;gap:7px;border-top:1px solid #e8e8e4;padding-top:16px;">${trustItems}</div>` : ''}
    <details style="border-top:1px solid #e8e8e4;padding-top:16px;">
      <summary style="cursor:pointer;font-size:14px;font-weight:600;">Descripción del producto</summary>
      <div style="padding-top:12px;font-size:14px;color:#6b6b6b;line-height:1.7;">${esc(copy.description)}</div>
    </details>
  </div>
</div>

<!-- SPECS -->
${specsHtml ? `<div style="background:#f7f7f5;"><div style="padding:72px 5%;max-width:1200px;margin:0 auto;">
  <span style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;display:block;margin-bottom:12px;">Detalles</span>
  <h2 style="font-size:32px;font-weight:700;margin-bottom:40px;">${esc(copy.specs_title)}</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5px;background:#e8e8e4;border:1.5px solid #e8e8e4;border-radius:14px;overflow:hidden;">${specsHtml}</div>
  ${badgesHtml ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:40px;">${badgesHtml}</div>` : ''}
</div></div>` : ''}

<!-- INGREDIENTS -->
${ingsHtml ? `<div style="background:${brand};color:#fff;"><div style="padding:72px 5%;max-width:1200px;margin:0 auto;">
  <span style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.5);display:block;margin-bottom:12px;">Lo que hay adentro</span>
  <h2 style="font-size:32px;font-weight:700;color:#fff;margin-bottom:40px;">${esc(copy.ingredients_title)}</h2>
  <div style="max-width:820px;">${ingsHtml}</div>
</div></div>` : ''}

<!-- TIMELINE -->
${tlHtml ? `<div style="background:#f7f7f5;"><div style="padding:72px 5%;max-width:1200px;margin:0 auto;">
  <span style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;display:block;margin-bottom:12px;">Resultados</span>
  <h2 style="font-size:32px;font-weight:700;margin-bottom:40px;">${esc(copy.timeline_title)}</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5px;background:#e8e8e4;border:1.5px solid #e8e8e4;border-radius:18px;overflow:hidden;">${tlHtml}</div>
</div></div>` : ''}

<!-- COMPARISON -->
${cmpRowsHtml ? `<div><div style="padding:72px 5%;max-width:1200px;margin:0 auto;">
  <span style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;display:block;margin-bottom:12px;">Comparativa</span>
  <h2 style="font-size:32px;font-weight:700;margin-bottom:40px;">${esc(copy.comparison_title)}</h2>
  <table style="width:100%;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;border:1.5px solid #e8e8e4;">
    <thead style="background:#f2f2ef;"><tr>
      <th style="padding:16px 22px;text-align:left;font-size:14px;font-weight:600;color:#6b6b6b;border-bottom:1.5px solid #e8e8e4;"></th>
      <th style="padding:16px 22px;text-align:center;font-size:15px;font-weight:800;color:${brand};border-bottom:1.5px solid #e8e8e4;">${esc(copy.comparison_brand_col)}</th>
      <th style="padding:16px 22px;text-align:center;font-size:14px;font-weight:600;color:#6b6b6b;border-bottom:1.5px solid #e8e8e4;">${esc(copy.comparison_alt_col)}</th>
    </tr></thead>
    <tbody>${cmpRowsHtml}</tbody>
  </table>
</div></div>` : ''}

<!-- REVIEWS -->
${rvHtml ? `<div style="background:#f7f7f5;"><div style="padding:72px 5%;max-width:1200px;margin:0 auto;">
  ${copy.rating_summary ? `<div style="display:flex;align-items:baseline;gap:16px;padding-bottom:28px;border-bottom:1.5px solid #e8e8e4;margin-bottom:40px;"><div style="font-size:64px;font-weight:900;line-height:1;letter-spacing:-3px;">4.9</div><div><div style="color:#e8a920;font-size:20px;">★★★★★</div><div style="font-size:14px;color:#6b6b6b;">${esc(copy.rating_summary)}</div></div></div>` : ''}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">${rvHtml}</div>
</div></div>` : ''}

<!-- FAQ -->
${faqHtml ? `<div><div style="padding:72px 5%;max-width:1200px;margin:0 auto;text-align:center;">
  <span style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;display:block;margin-bottom:12px;">Preguntas frecuentes</span>
  <div style="max-width:720px;margin:40px auto 0;text-align:left;">${faqHtml}</div>
</div></div>` : ''}

<!-- CTA FINAL -->
<div style="background:${brand};color:white;padding:72px 5%;text-align:center;">
  <h2 style="font-size:32px;font-weight:700;color:white;margin-bottom:16px;">${esc(copy.cta_headline)}</h2>
  <p style="font-size:16px;opacity:.85;margin-bottom:28px;">${esc(copy.cta_subtext)}</p>
  <button style="width:100%;max-width:360px;padding:17px 24px;background:white;color:${brand};border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;display:block;margin:0 auto 12px;">Agregar al carrito</button>
  ${waBtn}
</div>

</body></html>`;
}

export default function LandingBuilderPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [kitLoading, setKitLoading] = useState(true);
  const [step, setStep] = useState<Step>('produto');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'ok' | 'error'>('idle');
  const [publishError, setPublishError] = useState('');
  const [publishedTheme, setPublishedTheme] = useState('');
  const [previewTab, setPreviewTab] = useState<'preview' | 'copy'>('preview');

  // Step 1 — Producto
  const [productUrl, setProductUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
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
      setShopifyConnected(!!(d.shopify_domain && d.shopify_admin_token));
    }).catch(e => { if (e.name !== 'AbortError') setHasApiKey(false); });
    return () => ac.abort();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const scrapeProduct = async () => {
    if (!productUrl.trim()) return;
    setScraping(true);
    setScrapeError('');
    try {
      const res = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim(), mode: 'landing' }),
      });
      const data: { clientRequest?: string; bullets?: string[]; shippingText?: string; reviews?: { name: string; quote: string }[]; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'No se pudo importar el producto');
      if (data.clientRequest) setBrief(data.clientRequest);
      if (data.bullets) {
        if (data.bullets[0]) setBullet1(data.bullets[0]);
        if (data.bullets[1]) setBullet2(data.bullets[1]);
        if (data.bullets[2]) setBullet3(data.bullets[2]);
      }
      if (data.shippingText) setShipping(data.shippingText);
      if (data.reviews) {
        if (data.reviews[0]) setT1(data.reviews[0]);
        if (data.reviews[1]) setT2(data.reviews[1]);
        if (data.reviews[2]) setT3(data.reviews[2]);
      }
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setScraping(false);
    }
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
          userReviews: [t1, t2, t3],
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

  const publishToShopify = async () => {
    if (!copy || !brandKit) return;
    setPublishStatus('publishing');
    setPublishError('');
    const liquidContent = generateLiquidTemplate(copy, brandKit, whatsapp, shipping);
    const templateJson = generateTemplateJson(copy, brandKit, [t1, t2, t3], whatsapp, shipping);
    try {
      const res = await fetch('/api/shopify/push-landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liquidContent, templateJson }),
      });
      const data: { ok?: boolean; themeName?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al publicar');
      setPublishedTheme(data.themeName || '');
      setPublishStatus('ok');
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Error inesperado');
      setPublishStatus('error');
    }
  };

  const downloadLiquid = () => {
    if (!copy || !brandKit) return;
    const template = generateLiquidTemplate(copy, brandKit, whatsapp, shipping);
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'condimento-landing.liquid';
    a.click();
    URL.revokeObjectURL(url);
  };

  const Steps = ['produto', 'merchant', 'resultado'];
  const stepLabels: Record<string, string> = {
    produto: 'Producto',
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
              {['produto', 'merchant', 'resultado'].map((s, i) => (
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
          {step === 'produto' && (
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">URL del producto <span className="text-xs font-normal text-gray-400">Opcional — importa el brief automáticamente</span></label>
                <div className="flex gap-2">
                  <input
                    value={productUrl}
                    onChange={e => { setProductUrl(e.target.value); setScrapeError(''); }}
                    onKeyDown={e => e.key === 'Enter' && scrapeProduct()}
                    placeholder="https://tienda.com/productos/nombre"
                    className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                  <button
                    onClick={scrapeProduct}
                    disabled={!productUrl.trim() || scraping || !hasApiKey}
                    className="px-4 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors whitespace-nowrap"
                  >
                    {scraping ? 'Importando...' : 'Importar'}
                  </button>
                </div>
                {scrapeError && <p className="text-xs text-red-500 mt-1">{scrapeError}</p>}
                {brief && productUrl && <p className="text-xs text-green-600 mt-1">✓ Brief importado — podés editarlo antes de continuar</p>}
              </div>

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
                  onClick={() => setStep('produto')}
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
              <p className="text-xs text-gray-400 mt-2">Headline, specs, ingredientes, timeline, comparativa, reseñas y FAQ</p>
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

              {/* Shopify Publish */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Publicar en Shopify</h2>
                    {shopifyConnected ? (
                      <p className="text-sm text-gray-500 mt-1">
                        Subí el template directo a tu tema activo. Después agregalo desde el Theme Editor a la product page.
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500 mt-1">
                        <a href="/perfil" className="font-semibold text-[#e42820] underline">Conectá tu tienda</a> en Perfil para publicar sin descargar archivos.
                      </p>
                    )}
                  </div>
                  {shopifyConnected && publishStatus !== 'ok' && (
                    <button
                      onClick={publishToShopify}
                      disabled={publishStatus === 'publishing'}
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors"
                    >
                      {publishStatus === 'publishing' ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Publicando...</>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Publicar en Shopify
                        </>
                      )}
                    </button>
                  )}
                </div>
                {publishStatus === 'ok' && (
                  <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-semibold">Template publicado</p>
                      <p className="text-emerald-600 mt-0.5">
                        Subido al tema <strong>{publishedTheme}</strong>. Creá una nueva página en Shopify y asignale el template <strong>page.condimento-landing</strong>, o agregá la sección desde el Theme Editor.
                      </p>
                    </div>
                  </div>
                )}
                {publishStatus === 'error' && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                    {publishError}
                  </div>
                )}
              </div>

              {/* Vista previa / Copy */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {(['preview', 'copy'] as const).map(tab => (
                    <button key={tab} onClick={() => setPreviewTab(tab)}
                      className={`flex-1 py-3 text-sm font-semibold transition-colors ${previewTab === tab ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {tab === 'preview' ? '👁 Vista previa' : '📋 Copy generado'}
                    </button>
                  ))}
                </div>

                {previewTab === 'preview' && (
                  <iframe
                    srcDoc={generatePreviewHtml(copy, brandKit, whatsapp, shipping)}
                    className="w-full border-0"
                    style={{ height: '80vh' }}
                    title="Vista previa landing"
                  />
                )}

                {previewTab === 'copy' && (
                <div className="p-6 space-y-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Copy generado</h3>

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
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{copy.specs_title}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {copy.specs?.map((spec, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">{spec.key}</p>
                        <p className="text-sm font-semibold text-gray-800 mt-1">{spec.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {copy.ingredients?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{copy.ingredients_title}</p>
                    <div className="space-y-2">
                      {copy.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <span className="text-xl">{ing.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{ing.name}</p>
                            <p className="text-xs text-gray-400">{ing.dose}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {copy.timeline?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{copy.timeline_title}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {copy.timeline.map((tl, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 min-w-[140px]">
                          <p className="text-xs font-bold text-[#e42820] uppercase tracking-wider">{tl.when}</p>
                          <p className="text-sm font-semibold text-gray-800 mt-1">{tl.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                )}
              </div>

              <button
                onClick={() => { setStep('produto'); setCopy(null); setPublishStatus('idle'); setPublishError(''); setPublishedTheme(''); }}
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
