import { DocumentUpload } from "../DocumentUpload";

export default function DocumentUploadExample() {
  return (
    <div className="p-6 max-w-2xl">
      <DocumentUpload
        onFileUpload={(files) => {
          console.log("Files uploaded:", files.map(f => f.name));
        }}
        onUrlSubmit={(url) => {
          console.log("URL submitted:", url);
        }}
      />
    </div>
  );
}
