"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { GlitchLogo } from "@/components/GlitchLogo";
import ScrollReveal from "@/components/landing/ScrollReveal";

const CONTACT_WEBHOOK_URL = "https://ai.intakt.co.za/webhook/contact-form";

export default function Footer() {
  const [messageFieldVisible, setMessageFieldVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const snipFormRef = useRef<HTMLElement>(null);
  const isSyntheticSubmit = useRef(false);
  const showMessageField = useCallback(() => setMessageFieldVisible(true), []);

  useEffect(() => {
    const el = snipFormRef.current;
    if (el) el.setAttribute("key", "a28c1236-0ca3-49eb-b355-172bde12ec42");
  }, []);

  const expandMessageOnSubmit = useCallback(() => setMessageFieldVisible(true), []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (isSyntheticSubmit.current) {
        isSyntheticSubmit.current = false;
        return;
      }
      e.preventDefault();
      expandMessageOnSubmit();
      const form = formRef.current;
      if (form) {
        const data = new FormData(form);
        const payload = {
          name: (data.get("your_name") as string)?.trim() ?? "",
          email: (data.get("your_email") as string)?.trim() ?? "",
          message: (data.get("your_message") as string)?.trim() ?? "",
        };
        fetch(CONTACT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (res.ok) setShowSuccess(true);
          })
          .catch(() => {});
        isSyntheticSubmit.current = true;
        requestAnimationFrame(() => {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
          );
        });
      }
    },
    [expandMessageOnSubmit]
  );

  const hideMessageFieldIfEmpty = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && messageContainerRef.current?.contains(next)) return;
      const value = messageRef.current?.value?.trim() ?? "";
      if (value === "") setMessageFieldVisible(false);
    },
    []
  );

  return (
    <footer className="relative w-full bg-white pt-6 md:pt-8 lg:pt-10 pb-6 md:pb-8 lg:pb-10">
      <div className="w-full px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto space-y-8 md:space-y-10 lg:space-y-12">
          {/* Contact form panel */}
          <ScrollReveal id="contact" className="relative rounded-[32px] overflow-hidden scroll-mt-24 md:scroll-mt-28">
            {/* Background image */}
            <div className="absolute inset-0">
              <Image
                src="/images/footer bg.svg"
                alt="Antistatic background"
                fill
                priority={false}
                className="object-cover"
              />
            </div>

            {/* Overlay content */}
            <div className="relative z-10 px-6 md:px-12 lg:px-24 py-16 md:py-20 lg:py-24 flex items-center justify-center text-center">
              <div className="max-w-3xl mx-auto w-full">
                <h2
                  className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 md:mb-7"
                  style={{ lineHeight: 1.25 }}
                >
                  Get in touch
                </h2>
                <p className="text-base md:text-lg text-white/80 mb-10 md:mb-12">
                  Have a question or want to learn more? Drop your email and a
                  <br className="hidden sm:block" />
                  message and we&apos;ll get back to you soon.
                </p>

                <snip-form
                  ref={snipFormRef}
                  data-key="a28c1236-0ca3-49eb-b355-172bde12ec42"
                  mode="live"
                  shorthand="false"
                >
                  {showSuccess ? (
                    <p className="text-lg md:text-xl text-white font-medium">
                      Thanks for reaching out. We&apos;ll be in touch soon.
                    </p>
                  ) : (
                  <form
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className="flex flex-col items-center gap-1 text-left w-full max-w-md mx-auto"
                  >
                    <div className="w-full flex flex-col sm:flex-row gap-1 sm:gap-4">
                      <div className="w-full sm:flex-1 min-w-0">
                        <input
                          id="name"
                          type="text"
                          name="your_name"
                          placeholder="Your name"
                          onFocus={showMessageField}
                          onBlur={hideMessageFieldIfEmpty}
                          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-full px-6 py-3.5 md:px-8 md:py-4 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all"
                          {...{ "sf-validate:required": true, "error-class:your_name": "!border-red-400" }}
                        />
                        <p
                          className="text-red-200 text-sm mt-1 min-h-[1.25rem]"
                          {...{ "error-show-text:your_name": "" }}
                        />
                      </div>
                      <div className="w-full sm:flex-1 min-w-0">
                        <input
                          id="email"
                          type="email"
                          name="your_email"
                          placeholder="Your email"
                          onFocus={showMessageField}
                          onBlur={hideMessageFieldIfEmpty}
                          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-full px-6 py-3.5 md:px-8 md:py-4 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all"
                          {...{ "sf-validate:required": true, "sf-validate:email": true, "error-class:your_email": "!border-red-400" }}
                        />
                        <p
                          className="text-red-200 text-sm mt-1 min-h-[1.25rem]"
                          {...{ "error-show-text:your_email": "" }}
                        />
                      </div>
                    </div>
                    <div
                      ref={messageContainerRef}
                      className="w-full grid transition-all duration-300 ease-out"
                      style={{
                        gridTemplateRows: messageFieldVisible ? "1fr" : "0fr",
                        opacity: messageFieldVisible ? 1 : 0,
                      }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <textarea
                          ref={messageRef}
                          id="msg"
                          name="your_message"
                          placeholder="Your message"
                          rows={4}
                          onBlur={hideMessageFieldIfEmpty}
                          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-2xl px-6 py-3.5 md:px-8 md:py-4 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all resize-none"
                          {...{
                            "sf-validate:required": true,
                            "sf-validate:min_length[5]": "Your message is too short",
                            "error-class:your_message": "!border-red-400",
                          }}
                        />
                        <p
                          className="text-red-200 text-sm mt-1 min-h-[1.25rem]"
                          {...{ "error-show-text:your_message": "" }}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      onClick={showMessageField}
                      className="relative bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-8 pr-16 py-3.5 md:pl-10 md:pr-20 md:py-4 font-medium hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-start disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ borderRadius: "50px" }}
                      {...{
                        "submit:text": "Sending…",
                        "submit:class": "opacity-60 pointer-events-none",
                      }}
                    >
                      <span>Send message</span>
                      <div
                        className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                        style={{ borderRadius: "9999px" }}
                      >
                        <Image
                          src="/images/arrow icon.svg"
                          alt=""
                          width={32}
                          height={32}
                          className="flex-shrink-0"
                        />
                      </div>
                    </button>
                  </form>
                  )}
                  <sf-result style={{ display: "none" }}>
                    <p className="text-lg md:text-xl text-white font-medium">
                      Thanks for reaching out. We&apos;ll be in touch soon.
                    </p>
                  </sf-result>
                </snip-form>
              </div>
            </div>
          </ScrollReveal>

          {/* Bottom row — no scroll animation */}
          <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-4 md:gap-6">
            {/* Logo */}
            <div className="order-2 md:order-1">
              <GlitchLogo
                src="/images/antistatic logo on white.svg"
                alt="Antistatic"
                className="h-8 w-auto"
              />
            </div>

            {/* Copyright */}
            <div className="text-xs md:text-sm text-gray-500 text-center order-1 md:order-2">
              Copyright © 2026. All rights reserved to Antistatic
            </div>

            {/* Links */}
            <div className="flex items-center gap-4 text-xs md:text-sm text-gray-500 order-3">
              <Link
                href="/privacy"
                className="hover:text-gray-900 transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/terms"
                className="hover:text-gray-900 transition-colors"
              >
                Terms &amp; Conditions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

