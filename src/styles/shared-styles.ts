import { css, unsafeCSS } from 'lit';
import layoutCss from './ext-layout.css?raw';
export const sharedStyles = css`${unsafeCSS(layoutCss)}`;
