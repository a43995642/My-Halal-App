import React from 'react';
import { useCamera } from '../hooks/useCamera';

interface CameraProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const { videoRef, error, isCapturing, captureImage } = useCamera();

  const handleTakePhoto = () => {
    captureImage(onCapture);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center animate-fade-in">
      {/* Visual Flash Effect */}
      <div 
        className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-150 ease-out ${isCapturing ? 'opacity-80' : 'opacity-0'}`} 
      />

      {error ? (
        <div className="text-white p-6 text-center max-w-sm bg-gray-800 rounded-2xl mx-4 shadow-2xl border border-gray-700 animate-slide-up z-40">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="mb-6 font-medium leading-relaxed text-gray-200">{error}</p>
          <button 
            onClick={onClose}
            className="bg-white text-black w-full py-3 rounded-xl font-bold hover:bg-gray-100 transition active:scale-95"
          >
            إغلاق
          </button>
        </div>
      ) : (
        <>
          <div className="relative w-full h-full flex flex-col bg-black">
             {/* Video Element - Important: muted and playsInline for mobile support */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            
            {/* Overlay Header with Safe Area Support */}
            <div className="absolute top-[env(safe-area-inset-top)] left-0 right-0 p-4 mt-4 z-10 flex justify-end">
               <button 
                onClick={onClose}
                disabled={isCapturing}
                className="text-white p-3 rounded-full bg-black/20 backdrop-blur-md hover:bg-black/40 transition active:scale-90 disabled:opacity-0 disabled:pointer-events-none"
                aria-label="إغلاق الكاميرا"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Guide Frame - Fades out during capture */}
            <div className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-200 ${isCapturing ? 'opacity-0' : 'opacity-100'}`}>
               <div className="relative">
                 {/* Main Frame Box - Transparent center */}
                 <div className="w-72 h-72 border-2 border-white/30 rounded-3xl relative bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                   {/* Corners */}
                   <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl -mt-1 -ml-1 shadow-sm"></div>
                   <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl -mt-1 -mr-1 shadow-sm"></div>
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl -mb-1 -ml-1 shadow-sm"></div>
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl -mb-1 -mr-1 shadow-sm"></div>
                 </div>
                 
                 {/* Helper Text */}
                 <div className="absolute -bottom-24 w-full text-center space-y-2">
                    <p className="text-white font-bold text-lg shadow-black drop-shadow-md">ضع المكونات في الإطار</p>
                    <p className="text-white/80 text-sm shadow-black drop-shadow-md bg-black/20 backdrop-blur-sm py-1 px-3 rounded-full inline-block">حاول تثبيت الكاميرا للدقة</p>
                 </div>
               </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/50 to-transparent flex justify-center items-center z-10">
              <button 
                onClick={handleTakePhoto}
                disabled={isCapturing}
                className={`w-20 h-20 rounded-full border-[5px] flex items-center justify-center transition-all shadow-2xl backdrop-blur-sm group
                  ${isCapturing 
                    ? 'border-white/50 bg-white/40 scale-95 cursor-wait' 
                    : 'border-white/30 bg-white/20 hover:bg-white/30 active:scale-95 cursor-pointer'
                  }`}
                aria-label="التقاط صورة"
              >
                <div className={`w-16 h-16 rounded-full bg-white shadow-inner border border-gray-200 transition-all duration-200 ${isCapturing ? 'scale-75 opacity-80' : 'group-active:scale-90'}`}></div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};