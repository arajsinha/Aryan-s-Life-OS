
import React from 'react';

const DynamicBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-black">
      {/* 1. Base Image Layer */}
      <div 
        className="absolute inset-0 animate-ken-burns opacity-50"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=2069&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* 2. Color Orbs Layer */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/30 rounded-full blur-[120px] animate-float-1"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-purple-600/20 rounded-full blur-[120px] animate-float-2"></div>
      </div>

      {/* 3. Scrolling Grid */}
      <div 
        className="absolute inset-0 opacity-[0.08] animate-grid" 
        style={{
          backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      ></div>

      {/* 4. Data Particles */}
      <div className="absolute inset-0">
        {[...Array(15)].map((_, i) => (
          <div 
            key={i}
            className="absolute bg-white rounded-full opacity-0"
            style={{
              width: (Math.random() * 2 + 1) + 'px',
              height: (Math.random() * 2 + 1) + 'px',
              left: (Math.random() * 100) + '%',
              bottom: '-5%',
              animation: `data-drift ${Math.random() * 15 + 15}s linear infinite`,
              animationDelay: `${Math.random() * 10}s`
            }}
          ></div>
        ))}
      </div>

      {/* 5. Fade Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/60"></div>
    </div>
  );
};

export default DynamicBackground;
