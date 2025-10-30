import { MouseEvent } from "react";
import { MessageCircle, Sparkles, BookOpen, Calendar } from "lucide-react";

export function EmptyState(props: { onSubmit: (question: string) => any }) {
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.textContent) {
      props.onSubmit(target.textContent);
    }
  };

  const suggestedQuestions = [
    {
      text: "¿Qué tipos de becas están disponibles?",
      icon: BookOpen,
      gradient: "from-[#da5b3e] to-[#e67e5b]"
    },
    {
      text: "¿Cuáles son los requisitos para aplicar?",
      icon: Sparkles,
      gradient: "from-[#e67e5b] to-[#f2a078]"
    },
    {
      text: "¿Cómo puedo solicitar una beca?",
      icon: MessageCircle,
      gradient: "from-[#da5b3e] to-[#c54a33]"
    },
    {
      text: "¿Cuándo son las fechas límite de aplicación?",
      icon: Calendar,
      gradient: "from-[#f2a078] to-[#da5b3e]"
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-red-50 opacity-60"></div>
      <div className="absolute top-10 left-10 w-32 h-32 bg-gradient-to-br from-[#da5b3e]/10 to-transparent rounded-full blur-xl"></div>
      <div className="absolute bottom-10 right-10 w-40 h-40 bg-gradient-to-tl from-[#da5b3e]/10 to-transparent rounded-full blur-xl"></div>
      
      <div className="relative z-10 mb-12">
        {/* Logo/Icono principal */}
        <div className="mb-6 relative">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#da5b3e] to-[#c54a33] rounded-2xl flex items-center justify-center shadow-lg shadow-[#da5b3e]/25 transform rotate-3">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold bg-gradient-to-r from-[#da5b3e] to-[#c54a33] bg-clip-text text-transparent mb-3">
          Becas Grupo Romero
        </h2>

      </div>
      
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full">
        {suggestedQuestions.map((question, index) => {
          const IconComponent = question.icon;
          return (
            <button
              key={index}
              onClick={handleClick}
              className="group relative p-6 text-left bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl hover:bg-white hover:border-[#da5b3e]/30 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-[#da5b3e]/10 hover:-translate-y-1"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${question.gradient} rounded-lg flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-gray-800 font-medium leading-relaxed group-hover:text-[#da5b3e] transition-colors duration-300">
                    {question.text}
                  </span>
                </div>
              </div>
              
              {/* Efecto de brillo en hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl transform -skew-x-12 translate-x-full group-hover:translate-x-[-200%]"></div>
            </button>
          );
        })}
      </div>
      
      {/* Texto de ayuda */}
      <div className="relative z-10 mt-8 text-sm text-gray-500">
        💡 Haz clic en cualquier pregunta para comenzar
      </div>
    </div>
  );
}
