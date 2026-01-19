
import React from 'react';

interface VisualizerProps {
  isActive: boolean;
  isSpeaking: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, isSpeaking }) => {
  return (
    <div className="flex items-center justify-center py-16">
      <div className={`relative flex items-center justify-center transition-all duration-1000 ${isActive ? 'scale-110' : 'scale-100'}`}>
        
        {/* Breathing Outer Circles */}
        <div className={`absolute w-64 h-64 rounded-full border border-blue-100/30 transition-all duration-1000 ${isActive ? 'opacity-100 animate-[ping_4s_linear_infinite]' : 'opacity-0 scale-50'}`}></div>
        <div className={`absolute w-80 h-80 rounded-full border border-indigo-50/20 transition-all duration-1000 delay-500 ${isActive ? 'opacity-100 animate-[ping_6s_linear_infinite]' : 'opacity-0 scale-50'}`}></div>

        {/* The Core Orb */}
        <div className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700 overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.1)] ${isActive ? 'bg-gradient-to-br from-white to-blue-50/80 border-2 border-white' : 'bg-white border border-slate-100'}`}>
          
          {/* Internal Glow for Voice */}
          <div className={`absolute inset-0 bg-gradient-to-t from-blue-400/10 to-transparent transition-opacity duration-500 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}></div>
          
          <div className="flex gap-2 items-center justify-center h-12">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full bg-gradient-to-t from-blue-400 to-indigo-300 transition-all duration-300 ease-out ${isActive ? 'opacity-100' : 'opacity-20'}`}
                style={{
                  height: isSpeaking ? `${15 + Math.random() * 30}px` : isActive ? '6px' : '4px',
                  opacity: isSpeaking ? 0.8 : 0.4,
                  transitionDelay: `${i * 50}ms`
                }}
              />
            ))}
          </div>
        </div>

        {/* Floating Halo for Speaker */}
        <div className={`absolute -inset-4 rounded-full border-2 border-blue-200/20 transition-transform duration-1000 ${isSpeaking ? 'scale-110 opacity-100 rotate-180' : 'scale-100 opacity-0 rotate-0'}`} style={{ borderStyle: 'dashed' }}></div>

        {/* Status indicator */}
        <div className="absolute -bottom-16 w-full text-center space-y-1">
          <p className={`text-[11px] font-bold tracking-[0.3em] uppercase transition-all duration-500 ${isActive ? 'text-blue-500' : 'text-slate-400'}`}>
            {isActive ? (isSpeaking ? 'Sahaya is speaking' : 'Listening with care') : 'Ready to listen'}
          </p>
          <div className={`h-0.5 w-12 bg-blue-400 mx-auto rounded-full transition-all duration-1000 ${isActive ? 'w-24' : 'w-0 opacity-0'}`}></div>
        </div>
      </div>
    </div>
  );
};

export default Visualizer;
