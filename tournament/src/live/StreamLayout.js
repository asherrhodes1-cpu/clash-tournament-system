import React, { useState } from 'react';
import { parseYouTubeId } from './liveUtils';

// Remembered on this device, so chat stays hidden for someone who hid it.
const KEY = 'stream-chat-hidden';
function useChatShown() {
  const [shown, setShown] = useState(() => {
    try {
      return window.localStorage.getItem(KEY) !== '1';
    } catch (err) {
      return true;
    }
  });
  const toggle = () => {
    setShown(!shown);
    try {
      window.localStorage.setItem(KEY, shown ? '1' : '0');
    } catch (err) {
      // Not remembered; it lasts until the page is loaded again.
    }
  };
  return [shown, toggle];
}

const TOOL = 'border border-gray-500 hover:border-white rounded-lg px-3 py-1 text-sm font-bold transition';

// A broadcast as the Live and finals pages show it, in the stream overlays'
// stone frame: the YouTube video with whatever is `below` it at the same
// width - the buttons to bet, vote or answer - and, to its right, YouTube's
// own live chat over whatever goes at the `side`. Chat can be hidden, and is
// left out on small screens, where YouTube doesn't offer it embedded.
// `empty` is what stands in for the video while there is no stream.
export default function StreamLayout({ videoUrl, title, empty, below, side }) {
  const videoId = parseYouTubeId(videoUrl);
  const [chat, toggleChat] = useChatShown();
  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <div className="league-stone">
          {videoId ? (
            <div className="league-inset overflow-hidden" style={{ paddingTop: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="league-inset p-10 text-center">{empty}</div>
          )}
        </div>
        {videoId && (
          <div className="flex flex-wrap justify-end gap-2">
            <a className={TOOL} href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">Watch on YouTube</a>
            <button type="button" aria-pressed={!chat} onClick={toggleChat} className={`${TOOL} hidden lg:inline-block`}>{chat ? 'Hide chat' : 'Show chat'}</button>
          </div>
        )}
        {below}
      </div>
      <div className="space-y-6 min-w-0">
        {videoId && chat && (
          <div className="league-stone hidden lg:block">
            <div className="league-inset overflow-hidden h-[26rem]">
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}&dark_theme=1`}
                title="Live chat"
              />
            </div>
          </div>
        )}
        {side}
      </div>
    </div>
  );
}
