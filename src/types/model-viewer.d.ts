/* eslint-disable @typescript-eslint/no-explicit-any */
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          'auto-rotate'?: boolean | string;
          'camera-controls'?: boolean | string;
          'interaction-prompt'?: string;
          poster?: string;
          loading?: string;
          ar?: boolean | string;
        },
        HTMLElement
      >;
    }
  }
}
