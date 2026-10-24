import React from 'react';
import dynamicBar from './assets/dynamic-bar.png';
import phoneix from './assets/phoneix.png';
import pyramid from './assets/pyramid.png';

const S_PATH = 'M62 34c-3-7-9-10-16-10-9 0-15 5-15 12 0 17 33 9 33 27 0 8-7 13-17 13-9 0-16-4-19-12';

function Sentinel() {
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4aa3ff" />
          <stop offset="1" stopColor="#2457d6" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#sg)" />
      <path d={S_PATH} fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}

function SentinelBusiness() {
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d3fa8" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#sbg)" />
      <g transform="translate(-8 4) scale(.9)">
        <path d={S_PATH} fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      </g>
      <path d="M78 20v22M67 31h22" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

function Spotlight() {
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="spg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3f55" />
          <stop offset="1" stopColor="#14151d" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#spg)" />
      <circle cx="44" cy="44" r="20" fill="none" stroke="#fff" strokeWidth="9" />
      <path d="M59 59l17 17" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

const IMAGES = { 'dynamic-bar': dynamicBar, phoneix, pyramid };
const SVGS = { sentinel: Sentinel, 'sentinel-business': SentinelBusiness, 'spotlight-clone': Spotlight };

export function AppIcon({ id, name }) {
  if (IMAGES[id]) return <img src={IMAGES[id]} alt="" draggable="false" />;
  const Svg = SVGS[id];
  if (Svg) return <Svg />;
  return <div className="fallback">{name.charAt(0)}</div>;
}
