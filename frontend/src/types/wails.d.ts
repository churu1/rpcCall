declare interface AIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

declare interface GrpcRequest {
  address: string;
  serviceName: string;
  methodName: string;
  body: string;
  metadata: { key: string; value: string }[];
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
  timeoutSec: number;
}

declare interface TimingDetail {
  connectMs: number;
  serializeMs: number;
  rpcMs: number;
  totalMs: number;
}

declare interface FieldInfo {
  name: string;
  typeName: string;
  repeated: boolean;
  mapEntry: boolean;
}

declare interface GrpcResponse {
  body: string;
  headers: { key: string; value: string }[];
  trailers: { key: string; value: string }[];
  statusCode: string;
  elapsedMs: number;
  error?: string;
  timing?: TimingDetail;
}

declare interface BenchmarkVariable {
  name: string;
  type: 'sequence' | 'random_int' | 'random_string' | 'list';
  min: number;
  max: number;
  values: string[];
}

declare interface BenchmarkConfig {
  mode: 'count' | 'duration' | 'qps';
  concurrency: number;
  totalRequests: number;
  durationSec: number;
  targetQps: number;
  rampUpEnabled: boolean;
  rampUpStepSec: number;
  rampUpStepAdd: number;
  variables: BenchmarkVariable[];
}

declare interface BenchmarkProgress {
  elapsedMs: number;
  totalSent: number;
  totalSuccess: number;
  totalError: number;
  currentQps: number;
  avgLatencyMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  errorCodes: Record<string, number>;
}

declare interface LatencyBucket {
  labelMs: string;
  count: number;
}

declare interface BenchmarkResult extends BenchmarkProgress {
  concurrency: number;
  durationMs: number;
  latencyBuckets: LatencyBucket[];
}

declare interface BenchmarkHistoryEntry {
  id: number;
  address: string;
  serviceName: string;
  methodName: string;
  config: BenchmarkConfig;
  result: BenchmarkResult;
  createdAt: string;
}

declare interface ChainStep {
  address: string;
  serviceName: string;
  methodName: string;
  body: string;
  metadata: { key: string; value: string }[];
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
}

declare interface ChainStepResult {
  index: number;
  statusCode: string;
  body: string;
  elapsedMs: number;
  error?: string;
}

declare interface ChainResult {
  steps: ChainStepResult[];
}

declare interface ChainTemplate {
  id: number;
  name: string;
  stepsJson: string;
  createdAt: string;
}

declare interface MockRule {
  serviceName: string;
  methodName: string;
  statusCode: string;
  delayMs: number;
  responseBody: string;
}

declare interface Environment {
  id: number;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
  createdAt: string;
}

declare interface AppCollection {
  id: number;
  name: string;
  createdAt: string;
}

declare interface SavedRequest {
  id: number;
  collectionId: number;
  name: string;
  address: string;
  serviceName: string;
  methodName: string;
  methodType: string;
  requestBody: string;
  metadata: string;
  useTls: boolean;
  certPath: string;
  keyPath: string;
  caPath: string;
  createdAt: string;
}

interface Window {
  go: {
    main: {
      App: {
        OpenProtoFileDialog: () => Promise<any[] | null>;
        OpenProtoDirDialog: () => Promise<any[] | null>;
        ListServicesViaReflection: (address: string) => Promise<any[]>;
        GetMethodTemplate: (serviceName: string, methodName: string) => Promise<string>;
        InvokeUnary: (req: GrpcRequest) => Promise<GrpcResponse>;
        InvokeClientStream: (req: GrpcRequest) => Promise<GrpcResponse>;
        InvokeServerStream: (req: GrpcRequest) => Promise<void>;
        InvokeBidiStream: (req: GrpcRequest) => Promise<void>;
        SelectCertFile: () => Promise<string>;
        GetHistory: (limit: number) => Promise<any[]>;
        GetHistoryDetail: (id: number) => Promise<any>;
        DeleteHistory: (id: number) => Promise<void>;
        ClearHistory: () => Promise<void>;
        SaveAddress: (name: string, address: string) => Promise<{ id: number; name: string; address: string; createdAt: string } | null>;
        ListAddresses: () => Promise<{ id: number; name: string; address: string; createdAt: string }[] | null>;
        UpdateAddress: (id: number, name: string, address: string) => Promise<void>;
        DeleteAddress: (id: number) => Promise<void>;
        LoadSavedProtos: () => Promise<any[] | null>;
        ListProtoSources: () => Promise<{ id: number; sourceType: string; path: string; importPaths: string[]; createdAt: string }[] | null>;
        DeleteProtoSource: (id: number) => Promise<void>;
        ClearProtoSources: () => Promise<void>;
        StartBenchmark: (req: GrpcRequest, cfg: BenchmarkConfig) => Promise<void>;
        StopBenchmark: () => Promise<void>;
        ExportBenchmarkResult: (result: BenchmarkResult, format: string) => Promise<string>;
        SaveBenchmarkHistory: (address: string, serviceName: string, methodName: string, config: BenchmarkConfig, result: BenchmarkResult) => Promise<void>;
        ListBenchmarkHistory: (limit: number) => Promise<BenchmarkHistoryEntry[] | null>;
        DeleteBenchmarkHistory: (id: number) => Promise<void>;
        ClearBenchmarkHistory: () => Promise<void>;
        ExportBenchmarkHTML: (result: BenchmarkResult) => Promise<string>;
        SaveEnvironment: (name: string, variables: Record<string, string>) => Promise<Environment | null>;
        ListEnvironments: () => Promise<Environment[] | null>;
        UpdateEnvironment: (id: number, name: string, variables: Record<string, string>) => Promise<void>;
        DeleteEnvironment: (id: number) => Promise<void>;
        SetActiveEnvironment: (id: number) => Promise<void>;
        GetActiveEnvironment: () => Promise<Environment | null>;
        SaveCollection: (name: string) => Promise<AppCollection | null>;
        ListCollections: () => Promise<AppCollection[] | null>;
        UpdateCollection: (id: number, name: string) => Promise<void>;
        DeleteCollection: (id: number) => Promise<void>;
        SaveRequestToCollection: (req: SavedRequest) => Promise<SavedRequest | null>;
        ListCollectionRequests: (collectionId: number) => Promise<SavedRequest[] | null>;
        DeleteSavedRequest: (id: number) => Promise<void>;
        GetMessageFields: (serviceName: string, methodName: string) => Promise<FieldInfo[] | null>;
        ExportWorkspace: () => Promise<string>;
        ImportWorkspace: () => Promise<void>;
        InvokeChain: (steps: ChainStep[]) => Promise<ChainResult>;
        SaveChainTemplate: (name: string, stepsJson: string) => Promise<ChainTemplate | null>;
        ListChainTemplates: () => Promise<ChainTemplate[] | null>;
        UpdateChainTemplate: (id: number, name: string, stepsJson: string) => Promise<void>;
        DeleteChainTemplate: (id: number) => Promise<void>;
        StartMockServer: (port: number, rules: MockRule[]) => Promise<void>;
        StopMockServer: () => Promise<void>;
        IsMockServerRunning: () => Promise<boolean>;
        GetMockServerPort: () => Promise<number>;
        GetAIConfig: () => Promise<AIConfig>;
        SaveAIConfig: (cfg: AIConfig) => Promise<void>;
        AIGenerateBody: (serviceName: string, methodName: string) => Promise<string>;
        AIAnalyzeResponse: (serviceName: string, methodName: string, responseBody: string, statusCode: string) => Promise<string>;
        AIDiagnoseError: (serviceName: string, methodName: string, statusCode: string, errorMessage: string, trailers: { key: string; value: string }[]) => Promise<string>;
      };
    };
  };
  runtime: {
    EventsOn: (event: string, callback: (...args: any[]) => void) => () => void;
    EventsOff: (event: string) => void;
  };
}
