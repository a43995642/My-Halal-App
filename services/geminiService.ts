import { GoogleGenAI, Type, Schema } from "@google/genai";
import { HalalStatus, ScanResult } from "../types";

// Note: API Key retrieval logic moved inside analyzeImage to prevent module-level crashes on startup

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: [HalalStatus.HALAL, HalalStatus.HARAM, HalalStatus.DOUBTFUL, HalalStatus.NON_FOOD],
      description: "The overall Halal status of the product.",
    },
    reason: {
      type: Type.STRING,
      description: "A short, clear explanation in Arabic explaining the decision based on ingredients found.",
    },
    ingredientsDetected: {
      type: Type.ARRAY,
      items: { 
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "The name of the ingredient in Arabic."
          },
          status: {
            type: Type.STRING,
            enum: [HalalStatus.HALAL, HalalStatus.HARAM, HalalStatus.DOUBTFUL],
            description: "The status of this specific ingredient."
          }
        },
        required: ["name", "status"]
      },
      description: "List of key ingredients found in the image with their individual status.",
    },
    confidence: {
      type: Type.INTEGER,
      description: "A score from 0 to 100 indicating confidence in the result based on image clarity and text readability.",
    }
  },
  required: ["status", "reason", "ingredientsDetected", "confidence"],
};

// Helper function to downscale image if dimensions exceed limits
const downscaleImageIfNeeded = (base64Str: string, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const width = img.width;
      const height = img.height;

      if (width <= maxWidth && height <= maxHeight) {
        resolve(base64Str);
        return;
      }

      let newWidth = width;
      let newHeight = height;

      // Calculate new dimensions maintaining aspect ratio
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      newWidth = Math.round(width * ratio);
      newHeight = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      // Maintain high quality for OCR
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

// Helper function to enhance image contrast and sharpness for better OCR
const enhanceImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Contrast Adjustment
      // Formula: New = (Old - 128) * contrast + 128
      const contrast = 1.25; // Increase contrast by 25%

      for (let i = 0; i < data.length; i += 4) {
        data[i] = ((data[i] - 128) * contrast) + 128;     // R
        data[i+1] = ((data[i+1] - 128) * contrast) + 128; // G
        data[i+2] = ((data[i+2] - 128) * contrast) + 128; // B
      }

      // 2. Simple Sharpening (Convolution)
      // Kernel:
      //  0 -1  0
      // -1  5 -1
      //  0 -1  0
      const inputBuffer = new Uint8ClampedArray(data);
      
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          
          for (let c = 0; c < 3; c++) { // Apply to RGB only
             const val = (inputBuffer[idx + c] * 5)
               - inputBuffer[idx + c - 4]
               - inputBuffer[idx + c + 4]
               - inputBuffer[idx + c - w * 4]
               - inputBuffer[idx + c + w * 4];
             
             data[idx + c] = val; // Clamping handled by Uint8ClampedArray
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      console.warn("Image enhancement failed to load image");
      resolve(base64Str);
    };
  });
};

export const analyzeImage = async (
  base64Image: string, 
  enhance: boolean = false,
  enableImageDownscaling: boolean = false
): Promise<ScanResult> => {
  
  // Retrieve API Key safely for both Node/CRA (process.env) and Vite (import.meta.env) environments
  // @ts-ignore: Handle both environment types
  const API_KEY = (typeof process !== 'undefined' && process.env?.API_KEY) || (import.meta as any).env?.VITE_API_KEY;

  if (!API_KEY) {
    return {
      status: HalalStatus.NON_FOOD,
      reason: "مفتاح API غير موجود. يرجى التأكد من إعدادات المشروع (ملف .env) أو إعدادات التطبيق.",
      ingredientsDetected: [],
      confidence: 0,
    };
  }

  // Initialize client here to avoid startup crashes
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  let processedImage = base64Image;

  // 1. Downscale if enabled (Limit to 2000x2000)
  if (enableImageDownscaling) {
    try {
      processedImage = await downscaleImageIfNeeded(processedImage, 2000, 2000);
    } catch (error) {
      console.warn("Failed to downscale image, using original", error);
    }
  }

  // 2. Enhance if enabled
  if (enhance) {
    try {
      processedImage = await enhanceImage(processedImage);
    } catch (error) {
      console.warn("Failed to enhance image, using original", error);
    }
  }

  try {
    // Remove the data URL prefix
    const cleanBase64 = processedImage.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");

    const promptText = `
    أنت خبير تدقيق غذائي إسلامي. مهمتك هي فحص المنتجات الغذائية بدقة متناهية.
    
    **المرحلة 0: التحقق من نوع الصورة (حاسمة جداً):**
    قبل تحليل أي مكونات، تحقق مما يلي بدقة:
    
    1. **كشف الباركود أو الأشياء غير الغذائية (Non-Food/Barcode):**
       - إذا كانت الصورة تظهر "باركود" (Barcode) أو QR Code فقط:
       - أو إذا كانت الصورة لمنتج غير غذائي واضح (مثل: إلكترونيات، ملابس، سيارة، وجه إنسان، دواء، أثاث):
       - يجب أن تكون النتيجة: **NON_FOOD**
       - السبب (reason): "هذا ليس منتجاً غذائياً أو صورة باركود فقط. يرجى تصوير قائمة مكونات منتج غذائي."
       - الثقة (confidence): 100
       - المكونات (ingredientsDetected): []

    2. **تحقق من جودة واكتمال الصورة (للمنتجات الغذائية):**
       - إذا كانت الصورة ضبابية (Blurry) أو النص غير مقروء:
       - النتيجة: **DOUBTFUL**
       - السبب (reason): "عذراً، البيانات غير واضحة في الصورة. يرجى التقاط صورة أقرب وأكثر وضوحاً."
       
       - إذا كانت الصورة واضحة ولكنها تظهر فقط "اسم المنتج" أو القيم الغذائية (Calories) بدون قائمة المكونات (Ingredients):
       - النتيجة: **DOUBTFUL**
       - السبب (reason): "بيانات المنتج غير كاملة. الصورة لا تحتوي على قائمة المكونات، يرجى تصوير القائمة الخلفية."

    --------------------------------------------------

    **المرحلة 1: تحليل المكونات (فقط إذا تجاوزت المرحلة 0 وكان المنتج غذائياً):**
    
    **تعليمات التحليل البصري (OCR):**
    - اقرأ كل كلمة في قائمة المكونات.
    - ابحث عن المكونات المخفية أو الرموز (E-numbers).

    **قواعد الفحص الحلال:**

    **القائمة 1: مكونات تعتبر حلال دائماً (القائمة البيضاء):**
    - الخضروات، الماء، الملح، السكر، الزيوت النباتية، البهارات.
    - المواد الكيميائية: صمغ الزانثان، صمغ الغوار، حمض الستريك، بنزوات الصوديوم.
    - النكهات الطبيعية (ما لم يُذكر حيواني).
    - المستحلبات (E471, etc) والمثبتات (تُعتبر حلال ما لم يذكر مصدر حيواني صريح).

    **القائمة 2: الممنوعات والشبهات (تحدد النتيجة):**
    1. **🔴 حرام (Haram):**
       - الخنزير (Pork, Lard, Bacon).
       - الكحول/الإيثانول (Alcohol, Wine).
       - كارمين (E120, Carmine).
       - أي مكون يذكر صراحة أنه "حيواني" (Animal Origin) غير حلال.

    2. **🟡 مشتبه به (Doubtful):**
       - الجيلاتين (Gelatin): إذا لم يذكر المصدر (مثل "Fish" أو "Halal").
       - الإنزيمات والمنفحة: إذا لم يُذكر "ميكروبية" أو "نباتية".
       - أي مكون حيواني عام غير محدد.

    **خوارزمية الحكم (Logic):**
    1. إذا كانت النتيجة من المرحلة 0 هي NON_FOOD أو DOUBTFUL، اعتمدها.
    2. ابحث عن القائمة 2 (حرام/مشتبه). إذا وجدت حرام -> HARAM. إذا وجدت مشتبه -> DOUBTFUL.
    3. إذا لم تجد شيئاً من القائمة 2، وكانت المكونات نباتية/كيميائية -> HALAL.
    
    **هام جداً:**
    بالنسبة لحقل ingredientsDetected، يجب أن تذكر اسم المكون وحالته (HALAL, HARAM, DOUBTFUL) لكل مكون تم رصده، وخاصة المكونات التي تسببت في الحكم النهائي.

    **حساب الثقة (Confidence):**
    - إذا كانت قائمة المكونات واضحة تماماً ومقروءة -> (90-100).
    - إذا كان النص مقروءاً بصعوبة -> (60-80).
    - لحالات NON_FOOD -> 100.

    المخرجات مطلوبة بصيغة JSON حصراً.
    `;

    const response = await ai.models.generateContent({
      // Using Gemini 3 Pro Preview for superior OCR capabilities on curved/shiny packaging
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        // Zero temperature ensures consistent, deterministic results for the same inputs
        temperature: 0.0,      
        topP: 0.1,             
        topK: 1,               
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from AI");
    }

    const result = JSON.parse(text) as ScanResult;
    return result;

  } catch (error: any) {
    console.error("Error analyzing image:", error);
    
    // Default error message
    let userMessage = "حدث خطأ غير متوقع أثناء تحليل الصورة. حاول مرة أخرى.";
    
    // Safe string conversion for error inspection
    const errString = error ? error.toString().toLowerCase() : "";
    const errMessage = error.message ? error.message.toLowerCase() : "";

    // 1. Network / Offline / DNS
    if (errString.includes("fetch failed") || errString.includes("network error") || errMessage.includes("network") || errMessage.includes("failed to fetch")) {
       userMessage = "لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مجدداً.";
    }
    // 2. Rate Limit / Quota (429)
    else if (errString.includes("429") || errMessage.includes("quota") || errMessage.includes("too many requests") || errMessage.includes("exhausted")) {
       userMessage = "تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً ثم المحاولة.";
    }
    // 3. Server Overload (503 / 500)
    else if (errString.includes("503") || errString.includes("500") || errMessage.includes("overloaded") || errMessage.includes("service unavailable") || errMessage.includes("internal server error")) {
       userMessage = "خوادم الذكاء الاصطناعي مشغولة حالياً. يرجى المحاولة بعد لحظات.";
    }
    // 4. Image Size Too Large / RPC (413)
    else if (errString.includes("413") || errMessage.includes("rpc failed") || errMessage.includes("too large") || errMessage.includes("payload")) {
       userMessage = "حجم الصورة كبير جداً. سيتم تقليل الدقة تلقائياً في المحاولة القادمة.";
    }
    // 5. API Key / Permission (400 / 403)
    else if (errString.includes("400") || errString.includes("403") || errMessage.includes("api key") || errMessage.includes("permission")) {
       userMessage = "حدث خطأ في إعدادات الاتصال (API Key) أو الصلاحيات.";
    }
    // 6. Blocked Content (Safety)
    else if (errMessage.includes("safety") || errMessage.includes("blocked") || errMessage.includes("policy")) {
       userMessage = "تم حظر المحتوى لانتهاك معايير السلامة. يرجى استخدام صورة مختلفة.";
    }
    // 7. JSON Parse Error (Model returned bad format)
    else if (error instanceof SyntaxError && error.message.includes("JSON")) {
       userMessage = "حدث خطأ في قراءة بيانات النتيجة. يرجى المحاولة مرة أخرى.";
    }

    return {
      status: HalalStatus.NON_FOOD,
      reason: userMessage,
      ingredientsDetected: [],
      confidence: 0,
    };
  }
};