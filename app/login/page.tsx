'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  NotAuthorized: 'כתובת המייל שלך אינה מורשית. פנה למנהל המערכת.',
  OAuthSignin: 'שגיאה בהתחברות עם ספק OAuth.',
  OAuthCallback: 'שגיאה בחזרה מספק OAuth.',
  Default: 'אירעה שגיאה. נסה שנית.',
};

function LoginContent() {
  const params = useSearchParams();
  const errorCode = params.get('error') ?? '';
  const errorMsg = ERROR_MESSAGES[errorCode] ?? (errorCode ? ERROR_MESSAGES.Default : '');

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center p-4">
      <div className="bg-white border border-[#d1d9e0] rounded-xl shadow-sm w-full max-w-sm p-8 text-center">
        {/* Logo / Title */}
        <div className="mb-6">
          <div className="w-12 h-12 bg-[#0969da] rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">פ</span>
          </div>
          <h1 className="text-xl font-bold text-[#1f2328]">מערכת פקודות תשלום</h1>
          <p className="text-sm text-[#636c76] mt-1">עיריית נתיבות — מחלקת חינוך</p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e] text-right">
            {errorMsg}
          </div>
        )}

        <p className="text-sm text-[#636c76] mb-6">התחבר עם חשבון הארגוני שלך</p>

        {/* Google */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-[#d1d9e0] rounded-lg text-sm font-medium text-[#1f2328] hover:bg-[#f0f3f6] transition-colors mb-3"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          המשך עם Google
        </button>

        {/* Microsoft */}
        <button
          onClick={() => signIn('microsoft-entra-id', { callbackUrl: '/' })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-[#d1d9e0] rounded-lg text-sm font-medium text-[#1f2328] hover:bg-[#f0f3f6] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#F25022" d="M1 1h10v10H1z"/>
            <path fill="#00A4EF" d="M13 1h10v10H13z"/>
            <path fill="#7FBA00" d="M1 13h10v10H1z"/>
            <path fill="#FFB900" d="M13 13h10v10H13z"/>
          </svg>
          המשך עם Microsoft
        </button>

        <p className="text-xs text-[#8c959f] mt-6">
          גישה למורשים בלבד. לא מורשה? פנה למנהל.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
