import { ImageResponse } from 'next/og';

import appConfig from '~/config/app.config';

export const alt =
  'Open Deal Book: the deal platform for teams that grow by acquisition';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#0a0a0a',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          {appConfig.name}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 32,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -2,
            maxWidth: 900,
          }}
        >
          Run every acquisition in one place.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 32,
            color: '#a1a1aa',
            maxWidth: 880,
          }}
        >
          Pipeline, diligence, data room, contracts, and closing, with your team
          and the other side each in the right lane.
        </div>
      </div>
    ),
    { ...size },
  );
}
