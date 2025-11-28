import { useRef, useState, useEffect, useCallback } from 'react';

export const useCamera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);

  // Helper to stop all tracks on a stream
  const stopStream = (stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const startCamera = useCallback(async () => {
    setError('');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('عذراً، متصفحك لا يدعم تشغيل الكاميرا.');
      return;
    }

    try {
      // Try to get a stream with moderate resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(e => console.error("Play error:", e));
      }

    } catch (err: any) {
      console.error("Camera start failed:", err);
      
      // Fallback attempts
      try {
          console.log("Retrying with basic constraints...");
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play().catch(e => console.error("Play error fallback:", e));
          }
          return; 
      } catch (fallbackErr: any) {
           console.error("Fallback failed too:", fallbackErr);
           
           const errorName = fallbackErr.name || err.name;
           const errorMessage = fallbackErr.message || err.message || '';

           if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorMessage.includes('Permission dismissed')) {
             setError('تم رفض إذن الكاميرا. يرجى النقر على أيقونة القفل بجانب الرابط في الأعلى وتفعيل الكاميرا، ثم تحديث الصفحة.');
           } else if (errorName === 'NotFoundError') {
             setError('لم يتم العثور على كاميرا في هذا الجهاز.');
           } else if (errorName === 'NotReadableError') {
              setError('الكاميرا مشغولة بتطبيق آخر. يرجى إغلاق التطبيقات الأخرى والمحاولة مجدداً.');
           } else {
             setError('حدث خطأ غير متوقع أثناء تشغيل الكاميرا. يرجى التأكد من الصلاحيات.');
           }
      }
    }
  }, []);

  const cleanupCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      stopStream(videoRef.current.srcObject as MediaStream);
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureImage = useCallback((onCapture: (imageSrc: string) => void) => {
    if (isCapturing) return;
    
    if (videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      setIsCapturing(true);

      const video = videoRef.current;
      
      // Visual delay for shutter effect
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          // High quality capture
          const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9); 
          onCapture(imageDataUrl);
          cleanupCamera();
        } else {
          setIsCapturing(false);
        }
      }, 150); 
    }
  }, [isCapturing, cleanupCamera]);

  useEffect(() => {
    startCamera();
    return () => cleanupCamera();
  }, [startCamera, cleanupCamera]);

  return {
    videoRef,
    error,
    isCapturing,
    captureImage
  };
};