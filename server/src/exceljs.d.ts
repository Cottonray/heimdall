// exceljs 는 **컨테이너에만** 깔린다 (`/opt/aiqa/node_modules`, Dockerfile).
//
// 로컬에서 타입 검사를 돌릴 때 그 패키지를 같이 깔게 만들지 않으려고 여기서 모양만
// 선언해 둔다. 우리가 쓰는 것은 워크북 만들기·시트 추가·이미지 박기 몇 개뿐이고,
// 그 값이 우리 로직으로 흘러들지 않으므로 느슨하게 두어도 잃는 것이 없다.
declare module 'exceljs' {
    const ExcelJS: any
    export default ExcelJS
}
