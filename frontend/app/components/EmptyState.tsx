import { MouseEvent } from "react";

export function EmptyState(props: { onSubmit: (question: string) => any }) {
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.textContent) {
      props.onSubmit(target.textContent);
    }
  };

  const suggestedQuestions = [
    "¿Qué tipos de becas están disponibles?",
    "¿Cuáles son los requisitos para aplicar?",
    "¿Cómo puedo solicitar una beca?",
    "¿Cuándo son las fechas límite de aplicación?"
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">
          Becas Grupo Romero
        </h2>
        <p className="text-gray-600">
          Pregúntame sobre becas, requisitos y procesos de aplicación
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
        {suggestedQuestions.map((question, index) => (
          <button
            key={index}
            onClick={handleClick}
            className="p-4 text-left bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors duration-200 shadow-sm"
          >
            <span className="text-gray-700">{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
