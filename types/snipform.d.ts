/**
 * SnipForm wrap: custom elements and directive attributes for TypeScript/JSX.
 * Use namespaced directives (e.g. error-show-text:field_name), not shorthand !field:*
 */

import "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "snip-form": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "data-key": string;
          mode?: string;
          shorthand?: "true" | "false";
        },
        HTMLElement
      >;
      "sf-result": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }

    interface HTMLAttributes<T> {
      "sf-validate:required"?: boolean | string;
      "sf-validate:email"?: boolean | string;
      "sf-validate:min_length[5]"?: string;
      "error-show-text:your_name"?: string;
      "error-show-text:your_email"?: string;
      "error-show-text:your_message"?: string;
      "error-class:your_name"?: string;
      "error-class:your_email"?: string;
      "error-class:your_message"?: string;
      "submit:text"?: string;
      "submit:class"?: string;
      "if-error-show"?: string;
    }
  }
}

export {};
