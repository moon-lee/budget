import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
const Base = typeof HTMLElement !== 'undefined' ? LitElement : class {} as unknown as typeof LitElement;
export class SampleView extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];
  override render() {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="view-scroll">
      <div class="topbar">
        <span class="crumb-current">Budget</span>
        <div class="spacer"></div>
        <button class="filter-btn" @click=${() => this.dispatchEvent(new CustomEvent('sample-action', { bubbles: true, composed: true }))}>Action</button>
      </div>
      <div class="view-container">
        <div class="view-container-inner">
          <h1>Budget</h1>
          <p>Your extension screen is ready — uses <code>ext-tokens.css</code> + <code>ext-layout.css</code> (<code>.topbar</code> / <code>.view-scroll</code> / <code>.view-container</code>).</p>
          <p>Accents (<code>.btn-primary</code>, <code>.crumb-link</code>, focus rings) follow <code>var(--ff-accent)</code>. Core sets it from <code>themeColor</code>; users can override it with <code>budget.themeColor</code>. Do not hardcode accent hex values.</p>
          <p style="opacity:0.6;font-size:12px">DB: add <code>budget_records</code> in <code>package.json</code> for persistence — see AGENTS.md §3.</p>
        </div>
      </div>
      </div>
    `;
  }
}
