import { SampleView } from './budget-view';
if (typeof customElements !== 'undefined' && !customElements.get('budget-view')) customElements.define('budget-view', SampleView as unknown as CustomElementConstructor);
