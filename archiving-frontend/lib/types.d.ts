// In lib/types.d.ts
import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    // Add webkitdirectory attribute
    webkitdirectory?: string;
  }
}