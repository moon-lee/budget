import { SampleView } from './budget-view';
import { BudgetOrchestrator } from './budget-orchestrator.js';
if (typeof customElements !== 'undefined' && !customElements.get('budget-view')) customElements.define('budget-view', SampleView as unknown as CustomElementConstructor);
if (typeof customElements !== 'undefined' && !customElements.get('budget-orchestrator')) customElements.define('budget-orchestrator', BudgetOrchestrator as unknown as CustomElementConstructor);
