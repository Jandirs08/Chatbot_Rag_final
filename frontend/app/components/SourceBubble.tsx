import { sendFeedback } from "../utils/sendFeedback";

export type Source = {
  url: string;
  title: string;
};

export function SourceBubble({
  source,
  highlighted,
  onMouseEnter,
  onMouseLeave,
  runId,
}: {
  source: Source;
  highlighted: boolean;
  onMouseEnter: () => any;
  onMouseLeave: () => any;
  runId?: string;
}) {
  return (
    <div
      onClick={async () => {
        window.open(source.url, "_blank");
        if (runId) {
          await sendFeedback({
            key: "user_click",
            runId,
            value: source.url,
            isExplicit: false,
          });
        }
      }}
      className={`cursor-pointer h-full overflow-hidden rounded-lg transition-colors duration-200 ${
        highlighted ? "bg-gray-600" : "bg-gray-700"
      } hover:bg-gray-600`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-4">
        <h3 className="text-sm font-normal text-white">
          {source.title}
        </h3>
      </div>
    </div>
  );
}
